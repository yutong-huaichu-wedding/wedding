import type { Metadata } from 'next';
export const metadata: Metadata = { title: '宇童 ♡ 懷筑｜12.12 幸福婚禮', description: '婚禮報到、相簿、祝福牆與互動遊戲' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="zh-Hant"><body>{children}</body></html>; }
