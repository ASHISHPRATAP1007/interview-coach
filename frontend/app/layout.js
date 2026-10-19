import './globals.css';

export const metadata = {
  title: 'Interview Coach',
  description: 'Mock interview practice aur khula live call assistant',
};

export default function RootLayout({ children }) {
  return (
    <html lang="hi">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
