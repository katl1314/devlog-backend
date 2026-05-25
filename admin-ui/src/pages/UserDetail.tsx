import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiGet, apiPatch, apiDelete } from '../lib/api';
import { useToast } from '../components/Toast';

interface RecentPost {
  title: string;
  status: string;
  created_at: string;
}

interface User {
  user_id: string;
  user_name: string;
  email: string;
  provider: string;
  status: string;
  created_at: string;
  recentPosts?: RecentPost[];
}

function formatDate(str?: string) {
  if (!str) return '-';
  return new Date(str).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

const INFO_ROWS = [
  '아이디',
  '이름',
  '이메일',
  '가입방식',
  '상태',
  '가입일',
] as const;

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const { showToast } = useToast();

  async function load() {
    try {
      setUser((await apiGet(`/admin/users/${id}`)) as User);
    } catch (err) {
      showToast((err as Error).message, 'danger');
    }
  }

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateStatus(status: string) {
    if (
      !window.confirm(
        `이 유저를 ${status === 'BLOCKED' ? '차단' : '활성화'}하시겠습니까?`,
      )
    )
      return;
    try {
      await apiPatch(`/admin/users/${id}/status`, { status });
      showToast(status === 'BLOCKED' ? '차단 완료' : '활성화 완료');
      load();
    } catch (err) {
      showToast((err as Error).message, 'danger');
    }
  }

  async function deleteUser() {
    if (
      !window.confirm(
        '강제 탈퇴 처리하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      )
    )
      return;
    try {
      await apiDelete(`/admin/users/${id}`);
      showToast('탈퇴 처리 완료');
      setTimeout(() => navigate('/users'), 1000);
    } catch (err) {
      showToast((err as Error).message, 'danger');
    }
  }

  const infoValues = user
    ? [
        user.user_id,
        user.user_name,
        user.email,
        user.provider,
        user.status,
        formatDate(user.created_at),
      ]
    : [];

  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-4">
        <Link to="/users" className="btn btn-sm btn-outline-secondary">
          ← 목록
        </Link>
        <h5 className="fw-bold mb-0">유저 상세</h5>
      </div>

      {!user ? (
        <div className="text-muted">불러오는 중...</div>
      ) : (
        <>
          <div className="row g-3">
            <div className="col-md-6">
              <div className="card border-0 shadow-sm">
                <div className="card-body">
                  <h6 className="card-title text-muted small mb-3">
                    기본 정보
                  </h6>
                  <dl className="row mb-0">
                    {INFO_ROWS.map((label, i) => (
                      <>
                        <dt
                          key={`${label}-dt`}
                          className="col-4 text-muted small"
                        >
                          {label}
                        </dt>
                        <dd key={`${label}-dd`} className="col-8 small">
                          {infoValues[i] ?? '-'}
                        </dd>
                      </>
                    ))}
                  </dl>
                </div>
              </div>
            </div>

            <div className="col-md-6">
              <div className="card border-0 shadow-sm">
                <div className="card-body">
                  <h6 className="card-title text-muted small mb-3">액션</h6>
                  <div className="d-flex flex-column gap-2">
                    <button
                      className="btn btn-warning btn-sm"
                      onClick={() => updateStatus('BLOCKED')}
                    >
                      차단
                    </button>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => updateStatus('ACTIVE')}
                    >
                      활성화
                    </button>
                    <hr />
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={deleteUser}
                    >
                      강제 탈퇴
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm mt-3">
            <div className="card-body">
              <h6 className="card-title text-muted small mb-3">
                최근 포스트 (5개)
              </h6>
              <table className="table table-sm mb-0">
                <thead className="table-light">
                  <tr>
                    <th>제목</th>
                    <th>상태</th>
                    <th>작성일</th>
                  </tr>
                </thead>
                <tbody>
                  {!user.recentPosts?.length ? (
                    <tr>
                      <td colSpan={3} className="text-muted">
                        포스트 없음
                      </td>
                    </tr>
                  ) : (
                    user.recentPosts.map((p, i) => (
                      <tr key={i}>
                        <td>{p.title}</td>
                        <td>{p.status}</td>
                        <td>{formatDate(p.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
