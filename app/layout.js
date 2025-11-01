export const metadata = {
  title: 'BarberAI ? Smart Barbershop Assistant',
  description: 'Bilingual barber assistant for bookings and advice'
};

import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="header">
            <div className="brand">?? BarberAI</div>
            <div className="tag">Smart barber assistant ? ????? ??????? ?????</div>
          </header>
          <main className="main">{children}</main>
          <footer className="footer">? {new Date().getFullYear()} BarberAI</footer>
        </div>
      </body>
    </html>
  );
}
