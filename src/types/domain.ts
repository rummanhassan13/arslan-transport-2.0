export type View =
  | "Dashboard"
  | "Shipments"
  | "Directory"
  | "Finance"
  | "Reports";

export type PaymentStatus = "Paid" | "Pending" | "Partially Paid" | "Overdue" | "Advance Paid" | "Credit Balance";
export type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Pending" | "Overdue" | "Partially Paid" | "Cancelled";

export type BillImage = {
  id: string;
  name: string;
  type: string;
};

export type ShipmentDriverAssignment = {
  id?: string;
  driverId: string | null;
  driverName: string;
  legOrder: number;
  fromLocation: string;
  toLocation: string;
  driverRate: number;
  notes: string;
  vehicleId?: string | null;
  vehicleNo?: string;
  truckTypeId?: string | null;
  truckType?: string;
  advancePaid?: number;
  initialAdvance?: number;
  totalPaid?: number;
  pending?: number;
};

export type Shipment = {
  id: string;
  organizationId?: string;
  sr: number;
  shipmentNo?: string | null;
  date: string;
  shipmentDate?: string;
  invoice: string;
  invoiceReference?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  driverId?: string | null;
  vehicleId?: string | null;
  vehicleNumber?: string | null;
  truckTypeId?: string | null;
  truckTypeName?: string | null;
  status?: "pending" | "in_transit" | "delivered" | "completed" | "cancelled";
  loadingPoint: string;
  destination: string;
  customer: string;
  driverName: string;
  vehicleNo: string;
  truckType: string;
  cellNo: string;
  companyRate: number;
  driverRate: number;
  advance: number;
  gatePass: number;
  fashah: number;
  naql: number;
  companyTotal: number;
  driverTotal: number;
  pending: number;
  netProfit: number;
  driverPaymentStatus: PaymentStatus;
  invoiceStatus: InvoiceStatus;
  clientPaymentStatus: PaymentStatus;
  remarks: string;
  billImages: BillImage[];
  assignments?: ShipmentDriverAssignment[];
  clientPaid?: number;
  clientBalance?: number;
  driverPaid?: number;
  financialWarnings?: string[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
};

export type ShipmentInput = Omit<
  Shipment,
  | "id"
  | "sr"
  | "companyTotal"
  | "driverTotal"
  | "pending"
  | "netProfit"
  | "billImages"
  | "companyRate"
  | "driverRate"
  | "advance"
  | "gatePass"
  | "fashah"
  | "naql"
> & {
  companyRate: number | "";
  driverRate: number | "";
  advance: number | "";
  gatePass: number | "";
  fashah: number | "";
  naql: number | "";
  assignments?: Omit<ShipmentDriverAssignment, "id">[];
};

export type ShipmentFilters = {
  date?: string;
  clientId?: string;
  driver: string;
  destination: string;
  invoiceStatus: string;
  clientPaymentStatus: string;
  driverPaymentStatus: string;
};

export type ShipmentUpdateInput = Partial<ShipmentInput>;

export type Client = {
  id: string;
  organizationId: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ClientInput = {
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  status?: "active" | "inactive";
};

export type ClientUpdateInput = Partial<ClientInput>;

export type Driver = {
  id: string;
  organizationId: string;
  name: string;
  phone: string | null;
  cnic: string | null;
  licenseNumber: string | null;
  providerName: string | null;
  notes: string | null;
  status: "active" | "inactive" | "blocked";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type DriverInput = {
  name: string;
  phone?: string | null;
  cnic?: string | null;
  licenseNumber?: string | null;
  providerName?: string | null;
  notes?: string | null;
  status?: "active" | "inactive" | "blocked";
};

export type DriverUpdateInput = Partial<DriverInput>;

export type TruckType = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type TruckTypeInput = {
  name: string;
  description?: string | null;
  status?: "active" | "inactive";
};

export type TruckTypeUpdateInput = Partial<TruckTypeInput>;

export type Vehicle = {
  id: string;
  organizationId: string;
  vehicleNumber: string;
  truckTypeId: string | null;
  truckTypeName?: string | null;
  driverId: string | null;
  driverName?: string | null;
  notes: string | null;
  status: "active" | "inactive" | "maintenance" | "blocked";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type VehicleInput = {
  vehicleNumber: string;
  truckTypeId?: string | null;
  driverId?: string | null;
  notes?: string | null;
  status?: "active" | "inactive" | "maintenance" | "blocked";
};

export type VehicleUpdateInput = Partial<VehicleInput>;

export type StandardExpenseCategory =
  | "gate_pass"
  | "fashah"
  | "naql"
  | "fuel"
  | "toll"
  | "loading_unloading"
  | "repair"
  | "parking"
  | "food"
  | "waiting_charges"
  | "other";

// Organizations may create additional categories. Standard values are retained
// for suggestions and reporting, but the persisted domain accepts custom names.
export type ExpenseCategory = StandardExpenseCategory | (string & {});

export type ExpensePaidBy = "company" | "driver" | "client" | "other";

export type ShipmentExpense = {
  id: string;
  organizationId: string;
  shipmentId: string;
  shipmentAssignmentId?: string | null;
  shipmentNo?: string | null;
  invoiceReference?: string | null;
  clientName?: string | null;
  driverName?: string | null;
  category: ExpenseCategory;
  actualCostAmount?: number;
  clientBillAmount?: number;
  amount: number;
  paidBy: ExpensePaidBy;
  clientBillable: boolean;
  driverReimbursable: boolean;
  approved: boolean;
  includedInInvoice: boolean;
  expenseDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ShipmentExpenseInput = {
  shipmentId: string;
  shipmentAssignmentId?: string | null;
  category: ExpenseCategory;
  actualCostAmount?: number;
  clientBillAmount?: number;
  amount: number;
  paidBy?: ExpensePaidBy;
  clientBillable?: boolean;
  driverReimbursable?: boolean;
  approved?: boolean;
  includedInInvoice?: boolean;
  expenseDate?: string;
  notes?: string | null;
};

export type ShipmentExpenseUpdateInput = Partial<ShipmentExpenseInput>;

export type ExpenseFilters = {
  shipmentId?: string;
  category?: ExpenseCategory | "";
  paidBy?: ExpensePaidBy | "";
  approved?: "approved" | "pending" | "";
  dateFrom?: string;
  dateTo?: string;
};

export type AttachmentKind = "image" | "pdf" | "other";

export type ExpenseAttachment = {
  id: string;
  organizationId: string;
  shipmentId: string;
  expenseId: string | null;
  storageProvider: "r2";
  bucketName: string;
  objectKey: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  compressed: boolean;
  uploadedBy: string | null;
  createdAt: string;
  deletedAt: string | null;
};

export type ExpenseAttachmentInput = {
  shipmentId: string;
  expenseId?: string | null;
  storageProvider?: "r2";
  bucketName: string;
  objectKey: string;
  fileName: string;
  fileType?: string | null;
  fileSize?: number | null;
  compressed?: boolean;
};

export type ExpenseAttachmentUpdateInput = Partial<Omit<ExpenseAttachmentInput, "shipmentId">>;

export type AttachmentFilters = {
  shipmentId?: string;
  expenseId?: string;
  fileType?: string;
};

export type ShipmentAttachmentCategory =
  | "bill"
  | "receipt"
  | "gate_pass"
  | "fashah"
  | "naql"
  | "loading_slip"
  | "unloading_slip"
  | "proof_of_delivery"
  | "invoice_support"
  | "driver_document"
  | "client_document"
  | "other";

export type ShipmentAttachment = {
  id: string;
  organizationId: string;
  shipmentId: string;
  shipmentExpenseId: string | null;
  category: ShipmentAttachmentCategory;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageKey: string;
  uploadedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ShipmentAttachmentInput = {
  shipmentId: string;
  shipmentExpenseId?: string | null;
  category?: ShipmentAttachmentCategory;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageKey: string;
  notes?: string | null;
};

export type ShipmentAttachmentUpdateInput = {
  category?: ShipmentAttachmentCategory;
  notes?: string | null;
};

export type ShipmentAttachmentFilters = {
  shipmentId?: string;
  shipmentExpenseId?: string;
  category?: ShipmentAttachmentCategory;
  fileType?: string;
};

export type InvoiceRecordStatus = "draft" | "sent" | "paid" | "partially_paid" | "overdue" | "cancelled";
export type InvoiceItemType = "transport" | "expense" | "adjustment" | "other";
export type DriverPaymentType = "advance" | "settlement" | "reimbursement" | "adjustment";

export type Invoice = {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  invoicePrefix: string | null;
  shipmentId: string | null;
  clientId: string | null;
  issueDate: string;
  dueDate: string | null;
  status: InvoiceRecordStatus;
  clientSnapshot: Record<string, unknown>;
  shipmentSnapshot: Record<string, unknown>;
  subtotal: number;
  expenseTotal: number;
  totalAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  issuedAt?: string | null;
  sentAt?: string | null;
  voidedAt?: string | null;
  idempotencyKey?: string | null;
  clientName?: string | null;
  shipmentReference?: string | null;
  destination?: string | null;
};

export type InvoiceInput = {
  invoiceNumber: string;
  invoicePrefix?: string | null;
  shipmentId?: string | null;
  clientId?: string | null;
  issueDate?: string;
  dueDate?: string | null;
  status?: InvoiceRecordStatus;
  clientSnapshot?: Record<string, unknown>;
  shipmentSnapshot?: Record<string, unknown>;
  subtotal?: number;
  expenseTotal?: number;
  totalAmount?: number;
  notes?: string | null;
};

export type InvoiceUpdateInput = Partial<InvoiceInput>;

export type InvoiceItem = {
  id: string;
  organizationId: string;
  invoiceId: string;
  itemType: InvoiceItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  snapshot: Record<string, unknown>;
  createdAt: string;
};

export type InvoiceItemInput = {
  invoiceId: string;
  itemType?: InvoiceItemType;
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  snapshot?: Record<string, unknown>;
};

export type ClientPayment = {
  id: string;
  organizationId: string;
  invoiceId: string;
  clientId: string;
  shipmentId: string | null;
  amount: number;
  direction?: 1 | -1;
  reversalOfId?: string | null;
  idempotencyKey?: string | null;
  paymentDate: string;
  paymentMethod: string | null;
  referenceNo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  invoiceNumber?: string | null;
  clientName?: string | null;
  shipmentReference?: string | null;
};

export type ClientPaymentInput = {
  invoiceId: string;
  clientId: string;
  shipmentId?: string | null;
  amount: number;
  idempotencyKey?: string | null;
  paymentDate?: string;
  paymentMethod?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
};

export type ClientPaymentUpdateInput = Partial<ClientPaymentInput>;

export type DriverPayment = {
  id: string;
  organizationId: string;
  driverId: string;
  shipmentId: string | null;
  shipmentAssignmentId?: string | null;
  amount: number;
  direction?: 1 | -1;
  reversalOfId?: string | null;
  idempotencyKey?: string | null;
  paymentType: DriverPaymentType;
  paymentDate: string;
  paymentMethod: string | null;
  referenceNo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  driverName?: string | null;
  shipmentReference?: string | null;
};

export type DriverPaymentInput = {
  driverId: string;
  shipmentId?: string | null;
  shipmentAssignmentId?: string | null;
  amount: number;
  idempotencyKey?: string | null;
  paymentType?: DriverPaymentType;
  paymentDate?: string;
  paymentMethod?: string | null;
  referenceNo?: string | null;
  notes?: string | null;
};

export type DriverPaymentUpdateInput = Partial<DriverPaymentInput>;
