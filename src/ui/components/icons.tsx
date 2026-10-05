import type { ReactNode } from 'react';

/** Inline 24px stroke icons (1.75). No icon dependency: keeps the PWA shell small and offline-safe. */
const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
);

export const IconHome = () => <Svg><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.8V20h13V9.8" /><path d="M10 20v-5.5h4V20" /></Svg>;
export const IconMap = () => <Svg><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" /><path d="M9 4v14M15 6v14" /></Svg>;
export const IconRoute = () => <Svg><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8.2 18H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8" /></Svg>;
export const IconBasket = () => <Svg><path d="M4 9h16l-1.6 9.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8L4 9Z" /><path d="m8.5 9 3-5M15.5 9l-3-5" /></Svg>;
export const IconCamera = () => <Svg><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.2-2h6.6l1.2 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" /><circle cx="12" cy="13" r="3.2" /></Svg>;
export const IconShield = () => <Svg><path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6l-7-2.5Z" /><path d="m9 12 2.2 2.2L15.2 10" /></Svg>;
export const IconWaves = () => <Svg><path d="M3 9c2 0 2-1.5 4.5-1.5S10 9 12 9s2.5-1.5 4.5-1.5S19 9 21 9" /><path d="M3 14c2 0 2-1.5 4.5-1.5S10 14 12 14s2.5-1.5 4.5-1.5S19 14 21 14" /><path d="M3 19c2 0 2-1.5 4.5-1.5S10 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19" /></Svg>;

export const IconCheck = () => <Svg><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const IconCar = () => <Svg><path d="M4 16v-4l1.7-4.1A2 2 0 0 1 7.6 6.5h8.8a2 2 0 0 1 1.9 1.4L20 12v4" /><path d="M3 16h18v2.5H3zM7.5 12.5h.01M16.5 12.5h.01" /></Svg>;
export const IconTruck = () => <Svg><path d="M3 15v-4.5l2-3.5h8l2.6 3.5H20a1 1 0 0 1 1 1V15" /><circle cx="7.5" cy="16.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /><path d="M10 15.5h4" /></Svg>;
export const IconBan = () => <Svg><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></Svg>;
export const IconHelp = () => <Svg><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7M12 16.8h.01" /></Svg>;
export const IconAlert = () => <Svg><path d="M12 4 3 19.5h18L12 4Z" /><path d="M12 10v4M12 17h.01" /></Svg>;
export const IconDroplet = () => <Svg><path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5Z" /></Svg>;
export const IconCloudRain = () => <Svg><path d="M7 15a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7H7Z" /><path d="m9 18-1 3M13 18l-1 3M17 18l-1 3" /></Svg>;
export const IconRoad = () => <Svg><path d="M8 3 4.5 21M16 3l3.5 18M12 4v3M12 10.5v3M12 17v3" /></Svg>;
export const IconMegaphone = () => <Svg><path d="M4 10v4h3l7 4V6L7 10H4Z" /><path d="M17.5 9.5a4 4 0 0 1 0 5" /></Svg>;
export const IconMessage = () => <Svg><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9l-4.5 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></Svg>;
export const IconStore = () => <Svg><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20" /></Svg>;
export const IconFuel = () => <Svg><path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20M4 20h11M5 9h9M14 8l3 2v6a1.5 1.5 0 0 0 3 0V8.5L18 6" /></Svg>;
export const IconHospital = () => <Svg><rect x="4.5" y="4" width="15" height="16" rx="2" /><path d="M12 8v8M8 12h8" /></Svg>;
export const IconUtensils = () => <Svg><path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M17 21V3c-2.5 1-3.5 4-3.5 7.5H17" /></Svg>;
export const IconExternal = () => <Svg><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>;
export const IconPin = () => <Svg><path d="M12 21s6-5.6 6-10.5a6 6 0 0 0-12 0C6 15.4 12 21 12 21Z" /><circle cx="12" cy="10.5" r="2" /></Svg>;
export const IconClock = () => <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const IconPlus = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const IconVideo = () => <Svg><rect x="3.5" y="6" width="11" height="12" rx="1.5" /><path d="m14.5 10.5 6-3.5v10l-6-3.5" /></Svg>;
export const IconRefresh = () => <Svg><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></Svg>;
export const IconLock = () => <Svg><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>;
export const IconRuler = () => <Svg><rect x="3.5" y="8" width="17" height="8" rx="1.5" /><path d="M7 8v3M10.5 8v4.5M14 8v3M17.5 8v4.5" /></Svg>;
export const IconSend = () => <Svg><path d="M21 4 10.5 14.5M21 4l-6.5 16-4-5.500L4 11 21 4Z" /></Svg>;
