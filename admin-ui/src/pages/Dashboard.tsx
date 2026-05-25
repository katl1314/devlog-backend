import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import { useToast } from '../components/Toast'

interface DashboardData {
  totalUsers: number
  activeUsers: number
  blockedUsers: number
  withdrawnUsers: number
  totalPosts: number
  publishedPosts: number
  totalComments: number
  totalLikes: number
}

const USER_STATS = [
  { key: 'totalUsers', label: '총 유저', color: 'dark' },
  { key: 'activeUsers', label: '활성 유저', color: 'success' },
  { key: 'blockedUsers', label: '차단 유저', color: 'danger' },
  { key: 'withdrawnUsers', label: '탈퇴 유저', color: 'secondary' },
] as const

const POST_STATS = [
  { key: 'totalPosts', label: '총 포스트' },
  { key: 'publishedPosts', label: '게시됨' },
  { key: 'totalComments', label: '총 댓글' },
  { key: 'totalLikes', label: '총 좋아요' },
] as const

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    apiGet('/admin/dashboard')
      .then((d) => setData(d as DashboardData))
      .catch((err: Error) => showToast(err.message, 'danger'))
  }, [showToast])

  return (
    <>
      <h5 className="fw-bold mb-4">대시보드</h5>

      <div className="row g-3 mb-3">
        {USER_STATS.map(({ key, label, color }) => (
          <div key={key} className="col-6 col-md-3">
            <div className={`card border-none border-radius-lg bg-${color} text-white`} style={{ borderRadius: '0.5rem' }}>
              <div className="card-body">
                <div className="text-white-50 small mb-1">{label}</div>
                <div className="fs-4 fw-bold">{data ? data[key] : '-'}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3">
        {POST_STATS.map(({ key, label }) => (
          <div key={key} className="col-6 col-md-3">
            <div className="card border" style={{ borderRadius: '0.5rem' }}>
              <div className="card-body">
                <div className="text-muted small mb-1">{label}</div>
                <div className="fs-4 fw-bold">{data ? data[key] : '-'}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
