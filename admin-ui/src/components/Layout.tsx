import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { clearTokens } from '../lib/auth'

export default function Layout() {
  const navigate = useNavigate()

  function logout() {
    clearTokens()
    navigate('/login')
  }

  return (
    <>
      <nav className="sidebar">
        <NavLink to="/dashboard" className="sidebar-brand">
          dev.log Admin
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          대시보드
        </NavLink>
        <NavLink to="/users" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          유저 관리
        </NavLink>
        <NavLink to="/posts" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          포스트 관리
        </NavLink>
        <NavLink to="/comments" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
          댓글 관리
        </NavLink>
      </nav>
      <div className="topbar">
        <button className="btn btn-sm btn-outline-secondary" onClick={logout}>
          로그아웃
        </button>
      </div>
      <div className="page-wrapper">
        <div className="main-content">
          <Outlet />
        </div>
      </div>
    </>
  )
}
