import '@/app/public.css';
export default function RootDocument({
  children,
  locale = 'he',
}: {
  children: React.ReactNode;
  locale?: string;
}) {
  return (
    <html lang={locale === 'ar' ? 'ar' : 'he'} dir="rtl">
      <head>
        <meta name="application-name" content="Yafia Motors Next CMS" />
        <link rel="icon" href="/assets/logo.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/assets/fonts.css" />
        <link rel="stylesheet" href="/assets/style.css" />
        <link rel="stylesheet" href="/assets/media-v2.css" />
        <link rel="stylesheet" href="/assets/professional.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
