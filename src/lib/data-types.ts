export type Category = 'phone' | 'foldable' | 'tablet' | 'laptop' | 'headphones' | 'watch' | 'console' | 'wearable';
export type ArtKind =
  | 'phone'
  | 'foldable'
  | 'flip'
  | 'tablet'
  | 'laptop'
  | 'headphones'
  | 'earbuds'
  | 'watch'
  | 'console'
  | 'glasses'
  | 'headset';

export interface Spec {
  label: string;
  value: string;
}

/** Official press photo, credited to the brand. See docs/IMAGES.md. */
export interface ProductPhoto {
  src: string; // WebP, about 800px wide, path under /images/products/
  thumb: string; // smaller WebP for cards
  alt: string;
  credit: string; // e.g. "Samsung"
  sourceUrl: string; // the brand page the photo came from
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: Category;
  releaseDate: string; // YYYY-MM-DD
  launchPrice: number | null; // USD, base config
  officialUrl: string | null;
  criticsTake: string;
  loved: string[];
  gripes: string[];
  specs: Spec[];
  image?: ProductPhoto;
  art: { kind: ArtKind; body: string; accent: string; backdrop: [string, string] };
}

export interface Review {
  productId: string;
  outletId: string;
  critic: string | null;
  url: string;
  date: string; // YYYY-MM-DD
  rating: string | null; // the outlet's own score as published, e.g. "4.5/5"
  score: number; // 0-100
  scoreSource: 'rating' | 'text';
  excerpt: string;
  editorsChoice?: boolean;
  /** [floor, ceiling] the published rating allows (scripts/lib/rating-band.js). */
  scoreBand?: [number, number];
  /** Each model's placement inside the band; the score is their average. */
  modelScores?: Record<string, number>;
  /** One-line reason for the placement, in our words. */
  scoreReason?: string;
  scoredFromFullText?: boolean;
  /** Set when the two models' placements differ by more than 15 points: worth a human check. */
  modelsDisagree?: boolean;
  /** A person's placement after reading the review (used when the models disagree); it is the published score. */
  adjudicatedScore?: number;
  /** One line on why, required with adjudicatedScore. */
  adjudicationReason?: string;
  /** Context a reader needs, e.g. a joint review whose score is for a sibling model. */
  note?: string;
}

export interface Outlet {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4;
  domain: string;
  /** Other sites the outlet publishes reviews on. */
  altDomains?: string[];
}
