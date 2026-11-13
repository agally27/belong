import { TOPIC_LIST } from "@/lib/matching/topics";

export function TopicSelect({ name = "topic", defaultValue }: { name?: string; defaultValue?: string }) {
  const categories = [...new Set(TOPIC_LIST.map((t) => t.category))];
  return (
    <select name={name} className="field text-sm capitalize" defaultValue={defaultValue ?? ""} required aria-label="Topic">
      <option value="" disabled>
        Choose a topic
      </option>
      {categories.map((c) => (
        <optgroup key={c} label={c}>
          {TOPIC_LIST.filter((t) => t.category === c).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
