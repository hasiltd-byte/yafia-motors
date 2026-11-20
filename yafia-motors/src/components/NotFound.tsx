export default function NotFound() {
  return (
    <main className="not-found">
      <img src="/assets/logo.svg" alt="יפיע מוטורס" width="80" />
      <p>404</p>
      <h1>העמוד הזה ירד מהכביש.</h1>
      <p lang="ar">الصفحة غير موجودة.</p>
      <a href="/he/" className="btn">
        לעמוד הבית ←
      </a>
      <a href="/ar/" className="btn btn-dark" lang="ar">
        الرئيسية ←
      </a>
    </main>
  );
}
