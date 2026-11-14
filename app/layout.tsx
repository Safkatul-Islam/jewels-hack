import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

// `--font-sans` and `--font-geist-mono` are the names app/globals.css maps into
// Tailwind's font tokens. Renaming either one silently drops the typeface.
const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ARROYO — the last mile, as a sandbox',
  description:
    'A planning sandbox for the last mile around any major venue. Place shuttle hubs, park-and-rides, vendor villages and closures; see what your plan does to spectators, residents and local business.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables go on <html>, not <body>: app/globals.css applies
    // `font-sans` to the html element, so a variable defined only on body would
    // resolve to nothing and the whole app would render in Times.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
