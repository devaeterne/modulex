import FormHint from "@/components/form/FormHint";

type ServiceLineDetailsProps = {
  lineNote?: string | null;
};

export default function ServiceLineDetails({ lineNote }: ServiceLineDetailsProps) {
  const detail = lineNote?.trim();
  if (!detail) return null;
  return <FormHint>{detail}</FormHint>;
}