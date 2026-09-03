import ComponentCard from "@/components/common/ComponentCard";
import { ADMIN_TEXT_STYLES } from "@/components/ui/theme/adminTheme";

export default function ProjectPendingDomainTab({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <ComponentCard title={title} desc={description}>
      <p className={`text-sm ${ADMIN_TEXT_STYLES.body}`}>
        This Project does not have canonical {title.toLowerCase()} records in Modulex yet.
      </p>
    </ComponentCard>
  );
}
