import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function IconHome(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6.5 9.8V20h11V9.8" />
      <path d="M10 20v-5.2h4V20" />
    </svg>
  );
}

export function IconBolt(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13.2 3.2 7.2 12.6h4.2l-1 8.2 6.6-10.2h-4.4l.6-7.4Z" />
    </svg>
  );
}

export function IconSend(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 7.5v9" />
      <path d="M4.5 12h12" />
      <path d="M12.5 7.8 16.8 12l-4.3 4.2" />
    </svg>
  );
}

export function IconSeed(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 21V10" />
      <path d="M12 14c-3.2 0-5-2-5.2-5.2C10 8.2 12 10 12 14Z" />
      <path d="M12 12.5c3 0 4.8-1.6 5.2-4.6C14.2 7.4 12 9.2 12 12.5Z" />
      <path d="M8.5 19.5c2.2-1 4.8-1 7 0" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.2v2.2" />
    </svg>
  );
}

export function IconPeople(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="9" r="2.2" />
      <circle cx="16" cy="9" r="2.2" />
      <path d="M4.5 18.5c.6-2.3 2.2-3.5 3.5-3.5s2.9 1.2 3.5 3.5" />
      <path d="M12.5 18.5c.6-2.3 2.2-3.5 3.5-3.5s2.9 1.2 3.5 3.5" />
    </svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function IconEye(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 12S6.2 6.5 12 6.5 21.5 12 21.5 12 17.8 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 5.5 19 19" />
      <path d="M9.2 6.8A9 9 0 0 1 12 6.5c5.8 0 9.5 5.5 9.5 5.5a16 16 0 0 1-3.2 3.6" />
      <path d="M6.1 8.2C3.8 10 2.5 12 2.5 12S6.2 17.5 12 17.5c1.2 0 2.3-.2 3.3-.6" />
      <path d="M10 10.2a2.4 2.4 0 0 0 3.3 3.4" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M8 3.8v3.2" />
      <path d="M16 3.8v3.2" />
      <path d="M4 10h16" />
    </svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8.5 6.5v11l9-5.5-9-5.5Z" />
    </svg>
  );
}

export function IconDown(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v12" />
      <path d="M7 12.5 12 17.5l5-5" />
    </svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 6.5 15 12l-6 5.5" />
    </svg>
  );
}

export function IconBack(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 6.5 9 12l6 5.5" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 7l10 10" />
      <path d="M17 7 7 17" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5.5 12.5 4.2 4.2 8.8-9.4" />
    </svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M6 15.5H5.5A2 2 0 0 1 3.5 13.5v-8A2 2 0 0 1 5.5 3.5h8A2 2 0 0 1 15.5 5.5V6" />
    </svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 5h5v5" />
      <path d="M19 5 10.5 13.5" />
      <path d="M17 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4.5" />
    </svg>
  );
}

export function IconMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 256 256" fill="none" aria-hidden>
      <path
        d="M84 36C52 36 28 60 28 92C28 108 36 122 50 132V164C50 177 61 188 74 188C87 188 98 177 98 164V124H122C142 124 158 108 158 88C158 58 132 36 100 36H84Z"
        fill="currentColor"
      />
      <path
        d="M104 110L196 198C203 205 214 205 221 198C228 191 228 180 221 173L152 104L104 110Z"
        fill="var(--motion)"
      />
      <path
        d="M82 62H98C114 62 126 74 126 88C126 100 116 110 102 110H82C70 110 60 100 60 88C60 74 70 62 82 62Z"
        fill="var(--background)"
      />
    </svg>
  );
}
