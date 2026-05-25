interface Props {
  total: number
  page: number
  take: number
  onPageChange: (page: number) => void
}

export default function Pagination({ total, page, take, onPageChange }: Props) {
  const totalPages = Math.ceil(total / take)
  if (totalPages <= 1) return null

  return (
    <nav className="mt-3">
      <ul className="pagination justify-content-center">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <li key={p} className={`page-item${p === page ? ' active' : ''}`}>
            <a
              className="page-link"
              href="#"
              onClick={(e) => {
                e.preventDefault()
                onPageChange(p)
              }}
            >
              {p}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
