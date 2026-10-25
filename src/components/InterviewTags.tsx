export default function Tags({ tags }: { tags: string[] }) {
  return tags.length > 0 && <div className="interview-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
}
