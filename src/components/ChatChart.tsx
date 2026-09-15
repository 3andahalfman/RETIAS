import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend)

interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'scatter'
  data: {
    labels: string[]
    datasets: Array<{
      label: string
      data: number[]
      backgroundColor?: string | string[]
      borderColor?: string
      borderWidth?: number
      fill?: boolean
    }>
  }
  options?: Record<string, unknown>
}

export default function ChatChart({ configJson }: { configJson: string }) {
  let config: ChartConfig
  try {
    config = JSON.parse(configJson)
  } catch {
    return <pre className="chat-visual-error">Invalid chart JSON</pre>
  }

  const { type, data, options } = config
  const chartProps = { data, options: options ?? {} }

  switch (type) {
    case 'bar':
      return <div className="chat-chart"><Bar {...chartProps} /></div>
    case 'line':
      return <div className="chat-chart"><Line {...chartProps} /></div>
    case 'pie':
      return <div className="chat-chart"><Pie {...chartProps} /></div>
    case 'scatter':
      return <div className="chat-chart"><Scatter {...chartProps} /></div>
    default:
      return <pre className="chat-visual-error">Unsupported chart type: {type}</pre>
  }
}
