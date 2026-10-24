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
