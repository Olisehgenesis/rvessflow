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
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      <path
        fill="currentColor"
        d="M32 6c8.4 0 16 6.2 18.2 14.6-3.4-1.4-7-1.6-10.2-.4-2.2-6.2-8-10.2-14.6-9.2-8.2 1.2-13.6 9-12.4 17.2 1 6.8 6.2 12 13 13.2-1.6 3.4-2 7.2-1 10.8C16.6 50.2 10 41.6 10 32 10 17.6 19.8 6 32 6Z"
      />
      <path
        fill="currentColor"
        d="M34.2 28.4c7.6 1.2 12.8 8.2 11.6 15.8-1.4 8.6-9.2 14.2-17.8 12.8-4.8-.8-8.6-3.8-10.8-7.8 2.6 1.6 5.8 2.2 9 1.6 6.2-1 10.4-6.8 9.4-13-1-6.4-6.6-10.8-13-10.2 3.6-1.2 7.6-.8 11.6.8Z"
      />
    </svg>
  );
}
