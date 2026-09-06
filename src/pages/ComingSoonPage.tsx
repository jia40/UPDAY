function ComingSoonPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="dashboard-main" aria-labelledby="page-heading">
      <p className="dashboard-main__eyebrow">UPDAY</p>
      <h1 id="page-heading">{title}</h1>
      <p>{description} 기능을 준비하고 있습니다.</p>
    </section>
  )
}

export default ComingSoonPage
