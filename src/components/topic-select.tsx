import { INTEREST_TOPICS } from "@/lib/matching/topics";

export function TopicSelect({ name = "topic", defaultValue }: { name?: string; defaultValue?: string }) {
  const categories = [...new Set(INTEREST_TOPICS.map((t) => t.category))];
  return (
    <select name={name} className="field text-sm capitalize" defaultValue={defaultValue ?? ""} required aria-label="Topic">
      <option value="" disabled>
        Choose a topic
      </option>
      {categories.map((c) => (
        <optgroup key={c} label={c}>
          {INTEREST_TOPICS.filter((t) => t.category === c).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
