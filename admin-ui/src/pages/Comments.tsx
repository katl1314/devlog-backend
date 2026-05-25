import { useState, useEffect } from 'react'
import { apiGet, apiDelete } from '../lib/api'
import { useToast } from '../components/Toast'
import Pagination from '../components/Pagination'

interface Comment {
  id: string
  content: string
  post?: { title: string }
  user?: { user_id: string }
  created_at: string
}

interface ListData {
  data: Comment[]
  total: number
  page: number
}

const TAKE = 20

function formatDate(str: string) {
  if (!str) return '-'
  return new Date(str).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function Comments() {
  const [result, setResult] = useState<ListData | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { showToast } = useToast()

  async function load(p: number, s: string) {
    try {
      const data = (await apiGet('/admin/comments', { page: p, take: TAKE, search: s })) as ListData
      setResult(data)
    } catch (err) {
      showToast((err as Error).message, 'danger')
    }
  }

  useEffect(() => {
    load(page, search)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch() {
    setPage(1)
    load(1, search)
  }

  function handlePageChange(p: number) {
    setPage(p)
    load(p, search)
  }

  async function deleteComment(id: string) {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return
    try {
      await apiDelete(`/admin/comments/${id}`)
      showToast('삭제 완료')
      load(page, search)
    } catch (err) {
      showToast((err as Error).message, 'danger')
    }
  }

  return (
    <>
      <h5 className="fw-bold mb-4">댓글 관리</h5>

      <div className="d-flex gap-2 mb-3">
        <input
          type="text"
          className="form-control"
          style={{ maxWidth: 260 }}
          placeholder="내용, 작성자 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-dark" onClick={handleSearch}>
          검색
        </button>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ maxWidth: 300 }}>내용</th>
                <th>포스트</th>
                <th>작성자</th>
                <th>작성일</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!result ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    불러오는 중...
                  </td>
                </tr>
              ) : result.data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-4">
                    댓글이 없습니다.
                  </td>
                </tr>
              ) : (
                result.data.map((c) => (
                  <tr key={c.id}>
                    <td
                      style={{
                        maxWidth: 300,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.content?.length > 50 ? `${c.content.slice(0, 50)}...` : c.content}
                    </td>
                    <td>{c.post?.title ?? '-'}</td>
                    <td>{c.user?.user_id ?? '-'}</td>
                    <td>{formatDate(c.created_at)}</td>
                    <td>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => deleteComment(c.id)}>
                        삭제
                      </button>
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
