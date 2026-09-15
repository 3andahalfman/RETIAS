/**
 * Chat tools for the interview-room assistant — diagrams, charts, simple SVG illustrations.
 */

export const CHAT_TOOLS_INSTRUCTION = `
VISUAL TOOLS: You have tools to create diagrams, charts, and simple illustrations when a visual explanation helps (math workings, process flows, data comparisons, system architecture, etc.). Prefer tools over describing visuals in prose alone. After using a tool, briefly explain what the visual shows.

Available tools:
- create_diagram — Mermaid flowcharts, sequence diagrams, xychart-beta plots, etc.
- create_chart — bar, line, pie, or scatter charts. For math plots (cosine, sine, functions), use chart_type "line" with 30–50 evenly spaced x labels and matching y values.
- create_illustration — simple SVG diagrams (geometry, arrows, labeled boxes) when Mermaid is not a fit

Always call a tool when the user asks to plot, graph, draw, or illustrate something. After the tool runs, add a short explanation.
`.trim()

export interface ChatToolResult {
  contentForModel: string
  markdown: string
}

export function getAnthropicChatTools() {
  return [
    {
      name: 'create_diagram',
      description: 'Render a diagram using Mermaid syntax (flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, etc.). Use for process flows, relationships, timelines, and structured visuals.',
      input_schema: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Short caption for the diagram' },
          mermaid: { type: 'string', description: 'Valid Mermaid diagram source code' },
        },
        required: ['mermaid'],
      },
    },
    {
      name: 'create_chart',
      description: 'Render a bar, line, pie, or scatter chart. For trig/function plots use chart_type "line" with 30+ (x, y) samples (labels = x values as strings, data = y values).',
      input_schema: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Chart title' },
          chart_type: { type: 'string', enum: ['bar', 'line', 'pie', 'scatter'] },
          labels: { type: 'array', items: { type: 'string' }, description: 'X-axis labels or category names' },
          datasets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                data: { type: 'array', items: { type: 'number' } },
                backgroundColor: { type: 'string' },
              },
              required: ['label', 'data'],
            },
          },
        },
        required: ['chart_type', 'labels', 'datasets'],
      },
    },
    {
      name: 'create_illustration',
      description: 'Render a simple SVG illustration for geometry, arrows, labeled shapes, or custom layouts not covered by Mermaid.',
      input_schema: {
        type: 'object' as const,
        properties: {
          title: { type: 'string', description: 'Short caption' },
          svg: { type: 'string', description: 'SVG markup (root <svg> element with viewBox). No scripts or external refs.' },
          width: { type: 'number', description: 'Display width in pixels (default 400)' },
          height: { type: 'number', description: 'Display height in pixels (default 300)' },
        },
        required: ['svg'],
      },
    },
  ]
}

export function getOpenAIChatTools() {
  return getAnthropicChatTools().map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}

function sanitizeSvg(svg: string): string {
  const trimmed = svg.trim()
  if (!/^<svg[\s>]/i.test(trimmed)) {
    throw new Error('SVG must start with an <svg> element')
  }
  if (/<script|on\w+\s*=|javascript:/i.test(trimmed)) {
    throw new Error('SVG must not contain scripts or event handlers')
  }
  return trimmed
}

function buildChartConfig(input: {
  title?: string
  chart_type: string
  labels: string[]
  datasets: Array<{ label: string; data: number[]; backgroundColor?: string }>
}) {
  const type = input.chart_type
  if (!['bar', 'line', 'pie', 'scatter'].includes(type)) {
    throw new Error(`Unsupported chart_type: ${type}`)
  }
  if (!input.labels?.length || !input.datasets?.length) {
    throw new Error('labels and datasets are required')
  }

  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
  const datasets = input.datasets.map((ds, i) => ({
    label: ds.label,
    data: ds.data,
    backgroundColor: ds.backgroundColor ?? (type === 'pie' ? colors : colors[i % colors.length]),
    borderColor: type === 'line' || type === 'scatter' ? colors[i % colors.length] : undefined,
    borderWidth: type === 'line' || type === 'scatter' ? 2 : undefined,
    fill: type === 'line' ? false : undefined,
  }))

  return {
    type,
    data: { labels: input.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        title: input.title ? { display: true, text: input.title, color: '#e2e8f0' } : undefined,
        legend: { labels: { color: '#94a3b8' } },
      },
      scales: type === 'pie'
        ? undefined
        : {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.15)' } },
            y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.15)' } },
          },
    },
  }
}

export function executeChatTool(name: string, input: Record<string, unknown>): ChatToolResult {
  switch (name) {
    case 'create_diagram': {
      const mermaid = String(input.mermaid ?? '').trim()
      if (!mermaid) throw new Error('mermaid source is required')
      const title = input.title ? String(input.title) : ''
      const markdown = title
        ? `**${title}**\n\n\`\`\`mermaid\n${mermaid}\n\`\`\``
        : `\`\`\`mermaid\n${mermaid}\n\`\`\``
      return {
        contentForModel: `Diagram rendered successfully.${title ? ` Title: ${title}` : ''} The user can see it inline.`,
        markdown,
      }
    }
    case 'create_chart': {
      const config = buildChartConfig(input as Parameters<typeof buildChartConfig>[0])
      const json = JSON.stringify(config, null, 2)
      const title = input.title ? String(input.title) : ''
      const markdown = title
        ? `**${title}**\n\n\`\`\`chart\n${json}\n\`\`\``
        : `\`\`\`chart\n${json}\n\`\`\``
      return {
        contentForModel: `Chart rendered successfully (${config.type}). The user can see it inline.`,
        markdown,
      }
    }
    case 'create_illustration': {
      const svg = sanitizeSvg(String(input.svg ?? ''))
      const width = typeof input.width === 'number' ? input.width : 400
      const height = typeof input.height === 'number' ? input.height : 300
      const title = input.title ? String(input.title) : ''
      const payload = JSON.stringify({ svg, width, height })
      const markdown = title
        ? `**${title}**\n\n\`\`\`svg\n${payload}\n\`\`\``
        : `\`\`\`svg\n${payload}\n\`\`\``
      return {
        contentForModel: `SVG illustration rendered successfully.${title ? ` Title: ${title}` : ''} The user can see it inline.`,
        markdown,
      }
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
