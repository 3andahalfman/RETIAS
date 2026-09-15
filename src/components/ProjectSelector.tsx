interface Props {
  projects: ProjectSummary[]
  value: string
  onChange: (projectId: string) => void
  onManageProjects?: () => void
  label?: string
  hint?: string
}

export default function ProjectSelector({ projects, value, onChange, onManageProjects, label, hint }: Props) {
  const selected = projects.find((p) => p.id === value)

  return (
    <div className="setup-field">
      <div className="project-selector-head">
        <label className="setup-label">{label ?? '📁 Project context'}</label>
        {onManageProjects && (
          <button type="button" className="project-selector-manage" onClick={onManageProjects}>
            {projects.length === 0 ? '+ Create a project' : 'Manage projects'}
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <p className="project-selector-empty">
          No projects yet. Create one to attach your own instructions and reference files to every answer.
        </p>
      ) : (
        <>
          <select
            className="setup-select"
            title="Attach a saved project (instructions + files)"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— No project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.file_count > 0 ? ` (${p.file_count} file${p.file_count === 1 ? '' : 's'})` : ''}
              </option>
            ))}
          </select>
          <p className={`project-selector-hint${selected ? ' project-selector-hint--active' : ''}`}>
            {selected
              ? `✓ ${selected.name} attached — its instructions and files are included in every AI answer this session.`
              : hint ?? 'Project instructions and reference files will be included in every AI answer this session.'}
          </p>
        </>
      )}
    </div>
  )
}
