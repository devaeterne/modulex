-- PB-6 role classification: Sales Rep is structural; the other seeded business roles remain configurable defaults.

update public.project_participant_roles
set is_system = (role_key = 'sales_rep'),
    updated_at = now()
where role_key in (
  'sales_rep',
  'designer',
  'contractor',
  'installer',
  'referral_partner',
  'project_manager'
);
