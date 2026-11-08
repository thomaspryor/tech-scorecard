import { CATEGORY_LABEL } from '@/lib/format';
import type { Category } from '@/lib/data-types';

// The category chip. The release date is printed next to it on every card and page, so no month chip;
// no "new"/"pre-order" status either: a static build would freeze it on the build date.
export function ProductChips({ category }: { category: Category }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="chip border-sky-200 bg-sky-50 text-sky-800">{CATEGORY_LABEL[category]}</span>
    </div>
  );
}
