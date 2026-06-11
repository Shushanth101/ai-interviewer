import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aether - Premium AI Interviewer Dashboard',
  description: 'Rigorous topic-based and JD/Resume-based technical voice screenings powered by VAD, Groq Whisper STT, Llama 3, and Supertonic speech synthesis.',
  keywords: 'AI Interviewer, Technical Screenings, Mock Interviews, Voice Assistant, VAD, Speech-to-Text',
  authors: [{ name: 'DeepMind Team' }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#050508" />
      </head>
      <body>
        {/* Ambient glowing radial light sources behind layouts */}
        <div className="glowing-grid"></div>
        {children}
      </body>
    </html>
  );
}
