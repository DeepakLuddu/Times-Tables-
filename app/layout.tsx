import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Fredoka, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const fredoka = Fredoka({
  subsets: ['latin'],
  variable: '--font-fredoka',
  weight: ['400', '500', '600', '700'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  weight: ['500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Maths Dojo',
  description: 'Train your maths. Earn your black belts.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  themeColor: '#1b2340',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`bg-background ${fredoka.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
