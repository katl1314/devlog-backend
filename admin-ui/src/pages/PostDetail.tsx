import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { apiGet, apiPatch, apiDelete } from '../lib/api'
import { useToast } from '../components/Toast'

interface Post {
  id: number
  title: string
  user?: { user_id: string }
  visibility: boolean
  status: string
  created_at: string
  updated_at: string
  deleted_at?: string
}

function formatDate(str?: string) {
  if (!str) return '-'
  return new Date(str).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default function PostDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [post, setPost] = useState<Post | null>(null)
  const { showToast } = useToast()

  async function load() {
    try {
      setPost((await apiGet(`/admin/posts/${id}`)) as Post)
    } catch (err) {
      showToast((err as Error).message, 'danger')
    }
  }

  useEffect(() => {
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleVisibility() {
    try {
      await apiPatch(`/admin/posts/${id}/visibility`)
      showToast('공개 상태 변경 완료')
      load()
    } catch (err) {
      showToast((err as Error).message, 'danger')
    }
  }

  async function deletePost() {
    if (!window.confirm('포스트를 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
    try {
      await apiDelete(`/admin/posts/${id}`)
      showToast('삭제 완료')
      setTimeout(() => navigate('/posts'), 1000)
    } catch (err) {
      showToast((err as Error).message, 'danger')
    }
  }

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-4">
        <Link to="/posts" className="btn btn-sm btn-outline-secondary">
          ← 목록
        </Link>
        <h5 className="fw-bold mb-0">포스트 상세</h5>
      </div>

      {!post ? (
        <div className="text-muted">불러오는 중...</div>
      ) : (
        <div className="row g-3">
          <div className="col-md-8">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <h6 className="card-title text-muted small mb-3">포스트 정보</h6>
                <dl className="row mb-0">
                  {[
                    ['제목', post.title],
                    ['작성자', post.user?.user_id],
                    ['상태', post.status],
                    ['공개여부', post.visibility ? '공개' : '비공개'],
                    ['작성일', formatDate(post.created_at)],
                    ['수정일', formatDate(post.updated_at)],
                    ['삭제일', formatDate(post.deleted_at)],
                  ].map(([label, val]) => (
                    <>
                      <dt key={`${label}-dt`} className="col-4 text-muted small">
                        {label}
                      </dt>
                      <dd key={`${label}-dd`} className="col-8 small">
                        {val ?? '-'}
                      </dd>
                    </>
                  ))}
                </dl>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card border-0 shadow-sm">
              <div className="card-body">
                <h6 className="card-title text-muted small mb-3">액션</h6>
                <div className="d-flex flex-column gap-2">
                  <button className="btn btn-warning btn-sm" onClick={toggleVisibility}>
                    {post.visibility ? '비공개로 전환' : '공개로 전환'}
                  </button>
                  <hr />
                  <button className="btn btn-danger btn-sm" onClick={deletePost}>
                    강제 삭제
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
