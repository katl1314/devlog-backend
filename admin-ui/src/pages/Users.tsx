import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useToast } from '../components/Toast'
import Pagination from '../components/Pagination'

interface User {
  id: string
  user_id: string
  user_name: string
  email: string
  provider: string
  status: 'ACTIVE' | 'BLOCKED' | 'WITHDRAWN'
  created_at: string
}

interface ListData {
  data: User[]
  total: number
  page: number
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'success',
  BLOCKED: 'danger',
  WITHDRAWN: 'secondary',
}

const TAKE = 20

function formatDate(str: string) {
  if (!str) return '-'
  return new Date(str).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function Users() {
  const [result, setResult] = useState<ListData | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { showToast } = useToast()

  async function load(p: number, s: string, st: string) {
    try {
      const data = (await apiGet('/admin/users', { page: p, take: TAKE, search: s, status: st })) as ListData
      setResult(data)
    } catch (err) {
      showToast((err as Error).message, 'danger')
    }
  }

  useEffect(() => {
    load(page, search, status)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch() {
    setPage(1)
    load(1, search, status)
  }

  function handlePageChange(p: number) {
    setPage(p)
    load(p, search, status)
  }

  return (
    <>
      <h5 className="fw-bold mb-4">유저 관리</h5>

      <div className="d-flex gap-2 mb-3">
        <input
          type="text"
          className="form-control"
          style={{ maxWidth: 260 }}
          placeholder="이메일, 아이디, 이름 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <select
          className="form-select"
          style={{ maxWidth: 140 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">전체 상태</option>
          <option value="ACTIVE">활성</option>
          <option value="BLOCKED">차단</option>
          <option value="WITHDRAWN">탈퇴</option>
        </select>
        <button className="btn btn-dark" onClick={handleSearch}>
          검색
        </button>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>아이디</th>
                <th>이름</th>
                <th>이메일</th>
                <th>가입방식</th>
                <th>상태</th>
                <th>가입일</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!result ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    불러오는 중...
                  </td>
                </tr>
              ) : result.data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    유저가 없습니다.
                  </td>
                </tr>
              ) : (
                result.data.map((u) => (
                  <tr key={u.id}>
                    <td>{u.user_id}</td>
                    <td>{u.user_name}</td>
                    <td>{u.email}</td>
                    <td>{u.provider}</td>
                    <td>
                      <span className={`badge bg-${STATUS_COLORS[u.status] ?? 'secondary'}`}>{u.status}</span>
                    </td>
                    <td>{formatDate(u.created_at)}</td>
                    <td>
                      <Link to={`/users/${u.id}`} className="btn btn-sm btn-outline-secondary">
                        보기
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {result && <Pagination total={result.total} page={result.page} take={TAKE} onPageChange={handlePageChange} />}
    </>
  )
}
