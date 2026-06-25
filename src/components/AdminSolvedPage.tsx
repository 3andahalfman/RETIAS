import WindowControls from './WindowControls'
import AdminSolvedManager from './AdminSolvedManager'

interface Props {
  onDock: () => void
}

export default function AdminSolvedPage({ onDock }: Props) {
  return (
    <div className="dash-root admin-solved-page">
      <header className="dash-header">
        <div className="dash-header-text">
          <h1 className="dash-header-title">Solved Assessment Bank</h1>
          <p className="dash-header-sub">Browse, search, and delete curated Q&amp;A for Premium+ users.</p>
        </div>
        <WindowControls onDock={onDock} />
      </header>
      <main className="dash-main admin-solved-page-main">
        <AdminSolvedManager standalone />
      </main>
    </div>
  )
}
