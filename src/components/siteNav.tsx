// Sub-navigation for a single site. Used by the sidebar.

export interface SiteNavItem {
  slug: string; // "" = the site root (opportunities)
  label: string;
  icon: React.ReactNode;
}

export const SITE_SUBNAV: SiteNavItem[] = [
  {
    slug: "",
    label: "Opportunities",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path
          d="M8.5 11.5 11.5 8.5M9 6l1.4-1.4a3.25 3.25 0 0 1 4.6 4.6L13.6 10.6M11 14l-1.4 1.4a3.25 3.25 0 0 1-4.6-4.6L6.4 9.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    slug: "pages",
    label: "Pages",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path
          d="M11.5 2.5H6A1.5 1.5 0 0 0 4.5 4v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5l-4-4Zm0 0v4h4M7.5 10h5m-5 3h5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    slug: "clusters",
    label: "Clusters",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="14" cy="6" r="2.5" />
        <circle cx="6" cy="14" r="2.5" />
        <circle cx="14" cy="14" r="2.5" />
      </svg>
    ),
  },
  {
    slug: "performance",
    label: "Performance",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 16.5V13m4.5 3.5V9M12 16.5V11m4.5 5.5V5.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    slug: "install",
    label: "Install",
    icon: (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="m7 7-3.5 3L7 13m6-6 3.5 3L13 13m-1.5-8-3 10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];
