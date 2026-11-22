import { relations } from "drizzle-orm";

import { attendance, regularisations } from "./attendance";
import { account, session, user } from "./auth";
import {
  amcContracts,
  clientContacts,
  clients,
  clientSites,
  complaints,
  installations,
  serviceVisits,
} from "./clients";
import { fieldVisits, followUps } from "./field-visits";
import {
  leaveBalanceAdjustments,
  leaveBalances,
  leavePolicies,
  leavePolicyTypes,
  leaveRequests,
  leaveTypes,
} from "./leave";
import { smsBatches, smsMessages, smsTemplates } from "./messaging";
import {
  departments,
  employeeDocuments,
  employeeLocations,
  employees,
  holidays,
  officeLocations,
  shifts,
} from "./people";
import { auditLog } from "./system";

// Relations power `db.query.<table>.findMany({ with: { … } })`. They add no
// database constraints; the foreign keys live on the table definitions.
// `relationName` pairs both sides when two tables are linked more than once.

// ── Auth ─────────────────────────────────────────────────────

export const userRelations = relations(user, ({ one, many }) => ({
  employee: one(employees, {
    fields: [user.id],
    references: [employees.userId],
  }),
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

// ── People ───────────────────────────────────────────────────

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  head: one(employees, {
    fields: [departments.headEmployeeId],
    references: [employees.id],
    relationName: "department_head",
  }),
  members: many(employees, { relationName: "employee_department" }),
}));

export const shiftsRelations = relations(shifts, ({ many }) => ({
  employees: many(employees),
}));

export const officeLocationsRelations = relations(
  officeLocations,
  ({ many }) => ({
    employees: many(employeeLocations),
  }),
);

export const employeesRelations = relations(employees, ({ one, many }) => ({
  user: one(user, { fields: [employees.userId], references: [user.id] }),
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
    relationName: "employee_department",
  }),
  shift: one(shifts, {
    fields: [employees.shiftId],
    references: [shifts.id],
  }),
  leavePolicy: one(leavePolicies, {
    fields: [employees.leavePolicyId],
    references: [leavePolicies.id],
  }),
  manager: one(employees, {
    fields: [employees.managerId],
    references: [employees.id],
    relationName: "employee_manager",
  }),
  reports: many(employees, { relationName: "employee_manager" }),
  locations: many(employeeLocations),
  documents: many(employeeDocuments, { relationName: "document_employee" }),
  attendance: many(attendance, { relationName: "attendance_employee" }),
  leaveBalances: many(leaveBalances),
  leaveRequests: many(leaveRequests, {
    relationName: "leave_request_employee",
  }),
  fieldVisits: many(fieldVisits, { relationName: "field_visit_employee" }),
  followUps: many(followUps),
  serviceVisits: many(serviceVisits),
}));

export const employeeLocationsRelations = relations(
  employeeLocations,
  ({ one }) => ({
    employee: one(employees, {
      fields: [employeeLocations.employeeId],
      references: [employees.id],
    }),
    location: one(officeLocations, {
      fields: [employeeLocations.locationId],
      references: [officeLocations.id],
    }),
  }),
);

export const employeeDocumentsRelations = relations(
  employeeDocuments,
  ({ one }) => ({
    employee: one(employees, {
      fields: [employeeDocuments.employeeId],
      references: [employees.id],
      relationName: "document_employee",
    }),
  }),
);

// Holidays have no relations; listed so every table is accounted for.
export const holidaysRelations = relations(holidays, () => ({}));

// ── Attendance ───────────────────────────────────────────────

export const attendanceRelations = relations(attendance, ({ one, many }) => ({
  employee: one(employees, {
    fields: [attendance.employeeId],
    references: [employees.id],
    relationName: "attendance_employee",
  }),
  editedBy: one(employees, {
    fields: [attendance.updatedBy],
    references: [employees.id],
    relationName: "attendance_editor",
  }),
  shift: one(shifts, {
    fields: [attendance.shiftId],
    references: [shifts.id],
  }),
  checkInLocation: one(officeLocations, {
    fields: [attendance.checkInLocationId],
    references: [officeLocations.id],
  }),
  leaveRequest: one(leaveRequests, {
    fields: [attendance.leaveRequestId],
    references: [leaveRequests.id],
  }),
  regularisations: many(regularisations),
}));

export const regularisationsRelations = relations(
  regularisations,
  ({ one }) => ({
    employee: one(employees, {
      fields: [regularisations.employeeId],
      references: [employees.id],
      relationName: "regularisation_employee",
    }),
    decidedByEmployee: one(employees, {
      fields: [regularisations.decidedBy],
      references: [employees.id],
      relationName: "regularisation_decider",
    }),
    attendance: one(attendance, {
      fields: [regularisations.attendanceId],
      references: [attendance.id],
    }),
  }),
);

// ── Leave ────────────────────────────────────────────────────

export const leavePoliciesRelations = relations(leavePolicies, ({ many }) => ({
  types: many(leavePolicyTypes),
  employees: many(employees),
}));

export const leaveTypesRelations = relations(leaveTypes, ({ many }) => ({
  policies: many(leavePolicyTypes),
}));

export const leavePolicyTypesRelations = relations(
  leavePolicyTypes,
  ({ one }) => ({
    policy: one(leavePolicies, {
      fields: [leavePolicyTypes.policyId],
      references: [leavePolicies.id],
    }),
    leaveType: one(leaveTypes, {
      fields: [leavePolicyTypes.leaveTypeId],
      references: [leaveTypes.id],
    }),
  }),
);

export const leaveBalancesRelations = relations(leaveBalances, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveBalances.employeeId],
    references: [employees.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveBalances.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

export const leaveBalanceAdjustmentsRelations = relations(
  leaveBalanceAdjustments,
  ({ one }) => ({
    employee: one(employees, {
      fields: [leaveBalanceAdjustments.employeeId],
      references: [employees.id],
      relationName: "adjustment_employee",
    }),
    leaveType: one(leaveTypes, {
      fields: [leaveBalanceAdjustments.leaveTypeId],
      references: [leaveTypes.id],
    }),
    createdByEmployee: one(employees, {
      fields: [leaveBalanceAdjustments.createdBy],
      references: [employees.id],
      relationName: "adjustment_creator",
    }),
  }),
);

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveRequests.employeeId],
    references: [employees.id],
    relationName: "leave_request_employee",
  }),
  approver: one(employees, {
    fields: [leaveRequests.approverId],
    references: [employees.id],
    relationName: "leave_request_approver",
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveRequests.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

// ── Field visits ─────────────────────────────────────────────

export const fieldVisitsRelations = relations(fieldVisits, ({ one, many }) => ({
  employee: one(employees, {
    fields: [fieldVisits.employeeId],
    references: [employees.id],
    relationName: "field_visit_employee",
  }),
  reviewer: one(employees, {
    fields: [fieldVisits.reviewedBy],
    references: [employees.id],
    relationName: "field_visit_reviewer",
  }),
  client: one(clients, {
    fields: [fieldVisits.clientId],
    references: [clients.id],
  }),
  site: one(clientSites, {
    fields: [fieldVisits.siteId],
    references: [clientSites.id],
  }),
  serviceVisit: one(serviceVisits, {
    fields: [fieldVisits.serviceVisitId],
    references: [serviceVisits.id],
  }),
  followUps: many(followUps),
}));

export const followUpsRelations = relations(followUps, ({ one }) => ({
  fieldVisit: one(fieldVisits, {
    fields: [followUps.fieldVisitId],
    references: [fieldVisits.id],
  }),
  employee: one(employees, {
    fields: [followUps.employeeId],
    references: [employees.id],
  }),
  client: one(clients, {
    fields: [followUps.clientId],
    references: [clients.id],
  }),
}));

// ── Clients & AMC ────────────────────────────────────────────

export const clientsRelations = relations(clients, ({ one, many }) => ({
  salesOwner: one(employees, {
    fields: [clients.salesOwnerId],
    references: [employees.id],
    relationName: "client_sales_owner",
  }),
  contacts: many(clientContacts),
  sites: many(clientSites),
  complaints: many(complaints),
  fieldVisits: many(fieldVisits),
  followUps: many(followUps),
  smsMessages: many(smsMessages),
}));

export const clientContactsRelations = relations(clientContacts, ({ one }) => ({
  client: one(clients, {
    fields: [clientContacts.clientId],
    references: [clients.id],
  }),
}));

export const clientSitesRelations = relations(clientSites, ({ one, many }) => ({
  client: one(clients, {
    fields: [clientSites.clientId],
    references: [clients.id],
  }),
  installations: many(installations),
}));

export const installationsRelations = relations(
  installations,
  ({ one, many }) => ({
    site: one(clientSites, {
      fields: [installations.siteId],
      references: [clientSites.id],
    }),
    installer: one(employees, {
      fields: [installations.installedBy],
      references: [employees.id],
    }),
    contracts: many(amcContracts),
    serviceVisits: many(serviceVisits),
    complaints: many(complaints),
  }),
);

export const amcContractsRelations = relations(
  amcContracts,
  ({ one, many }) => ({
    installation: one(installations, {
      fields: [amcContracts.installationId],
      references: [installations.id],
    }),
    renewedFrom: one(amcContracts, {
      fields: [amcContracts.renewedFromId],
      references: [amcContracts.id],
      relationName: "contract_renewal",
    }),
    renewals: many(amcContracts, { relationName: "contract_renewal" }),
    serviceVisits: many(serviceVisits),
  }),
);

export const complaintsRelations = relations(complaints, ({ one, many }) => ({
  installation: one(installations, {
    fields: [complaints.installationId],
    references: [installations.id],
  }),
  client: one(clients, {
    fields: [complaints.clientId],
    references: [clients.id],
  }),
  assignee: one(employees, {
    fields: [complaints.assignedTo],
    references: [employees.id],
    relationName: "complaint_assignee",
  }),
  serviceVisits: many(serviceVisits),
}));

export const serviceVisitsRelations = relations(
  serviceVisits,
  ({ one, many }) => ({
    installation: one(installations, {
      fields: [serviceVisits.installationId],
      references: [installations.id],
    }),
    contract: one(amcContracts, {
      fields: [serviceVisits.contractId],
      references: [amcContracts.id],
    }),
    complaint: one(complaints, {
      fields: [serviceVisits.complaintId],
      references: [complaints.id],
    }),
    technician: one(employees, {
      fields: [serviceVisits.technicianId],
      references: [employees.id],
    }),
    fieldVisits: many(fieldVisits),
  }),
);

// ── Messaging ────────────────────────────────────────────────

export const smsTemplatesRelations = relations(smsTemplates, ({ many }) => ({
  batches: many(smsBatches),
  messages: many(smsMessages),
}));

export const smsBatchesRelations = relations(smsBatches, ({ one, many }) => ({
  template: one(smsTemplates, {
    fields: [smsBatches.templateId],
    references: [smsTemplates.id],
  }),
  messages: many(smsMessages),
}));

export const smsMessagesRelations = relations(smsMessages, ({ one }) => ({
  template: one(smsTemplates, {
    fields: [smsMessages.templateId],
    references: [smsTemplates.id],
  }),
  batch: one(smsBatches, {
    fields: [smsMessages.batchId],
    references: [smsBatches.id],
  }),
  client: one(clients, {
    fields: [smsMessages.clientId],
    references: [clients.id],
  }),
  contact: one(clientContacts, {
    fields: [smsMessages.contactId],
    references: [clientContacts.id],
  }),
  employee: one(employees, {
    fields: [smsMessages.employeeId],
    references: [employees.id],
    relationName: "sms_employee",
  }),
}));

// ── System ───────────────────────────────────────────────────

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(employees, {
    fields: [auditLog.actorId],
    references: [employees.id],
    relationName: "audit_actor",
  }),
}));
