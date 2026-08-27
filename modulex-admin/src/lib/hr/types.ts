export type EmploymentStatus = "active" | "on_leave" | "inactive" | "terminated";
export type EmploymentType = "full_time" | "part_time" | "contractor" | "temporary" | "intern";

export type HrDepartment = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HrPosition = {
  id: string;
  code: string;
  title: string;
  department_id: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HrEmployee = {
  id: string;
  employee_number: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  work_email: string | null;
  personal_email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  department_id: string | null;
  position_id: string | null;
  manager_id: string | null;
  employment_status: EmploymentStatus;
  employment_type: EmploymentType;
  hire_date: string | null;
  termination_date: string | null;
  termination_reason: string | null;
  work_location: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  active: "Active",
  on_leave: "On Leave",
  inactive: "Inactive",
  terminated: "Terminated",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contractor: "Contractor",
  temporary: "Temporary",
  intern: "Intern",
};
