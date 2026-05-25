import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useToast } from '../components/Toast'
import Pagination from '../components/Pagination'

interface Post {
  id: number
  title: string
  user?: { user_id: string }
  visibility: boolean
  status: string
  created_at: string
}

interface ListData {
  data: Post[]
  total: number
  page: number
}

const TAKE = 20

function formatDate(str: string) {
  if (!str) return '-'
  return new Date(str).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function Posts() {
  const [result, setResult] = useState<ListData | null>(null)
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const { showToast } = useToast()

  async function load(p: number, s: string, v: string, st: string) {
    try {
      const data = (await apiGet('/admin/posts', { page: p, take: TAKE, search: s, visibility: v, status: st })) as ListData
      setResult(data)
    } catch (err) {
      showToast((err as Error).message, 'danger')
    }
  }

  useEffect(() => {
    load(page, search, visibility, status)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch() {
    setPage(1)
    load(1, search, visibility, status)
  }

  function handlePageChange(p: number) {
    setPage(p)
    load(p, search, visibility, status)
  }

  return (
    <>
      <h5 className="fw-bold mb-4">포스트 관리</h5>

      <div className="d-flex gap-2 mb-3 flex-wrap">
        <input
          type="text"
          className="form-control"
          style={{ maxWidth: 260 }}
          placeholder="제목 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <select
          className="form-select"
          style={{ maxWidth: 130 }}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
        >
          <option value="">전체 공개</option>
          <option value="true">공개</option>
          <option value="false">비공개</option>
        </select>
        <select
          className="form-select"
          style={{ maxWidth: 130 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">전체 상태</option>
          <option value="published">게시됨</option>
          <option value="draft">초안</option>
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
                <th>제목</th>
                <th>작성자</th>
                <th>공개</th>
                <th>상태</th>
                <th>작성일</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!result ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    불러오는 중...
                  </td>
                </tr>
              ) : result.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-4">
                    포스트가 없습니다.
                  </td>
                </tr>
              ) : (
                result.data.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{p.user?.user_id ?? '-'}</td>
                    <td>
                      <span className={`badge bg-${p.visibility ? 'success' : 'secondary'}`}>
                        {p.visibility ? '공개' : '비공개'}
                      </span>
                    </td>
                    <td>{p.status}</td>
                    <td>{formatDate(p.created_at)}</td>
                    <td>
                      <Link to={`/posts/${p.id}`} className="btn btn-sm btn-outline-secondary">
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
