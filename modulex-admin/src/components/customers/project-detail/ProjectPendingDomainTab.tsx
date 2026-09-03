import ComponentCard from "@/components/common/ComponentCard";

export default function ProjectPendingDomainTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <ComponentCard title={title} desc={description}>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        This Project does not have canonical {title.toLowerCase()} records in Modulex yet.
      </p>
    </ComponentCard>
  );
}
