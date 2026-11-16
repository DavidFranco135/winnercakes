from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from src.domain.auth.roles import Role


class RegisterRequest(BaseModel):
    organization_name: str = Field(min_length=2, max_length=200)
    full_name: str | None = Field(default=None, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    # Opt-in "Manter conectado": only then is the refresh token also returned
    # in the response body (for the browser to keep on the device), because
    # the cross-site cookie alone is often blocked on mobile.
    remember_me: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str | None

    model_config = {"from_attributes": True}


class OrganizationResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    plan: str

    model_config = {"from_attributes": True}


class MembershipResponse(BaseModel):
    organization: OrganizationResponse
    role: Role


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str | None = None
    user: UserResponse


class MeResponse(BaseModel):
    user: UserResponse
    organizations: list[MembershipResponse]


class CreateOrganizationRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)


class OrgMemberResponse(BaseModel):
    user_id: UUID
    email: EmailStr
    full_name: str | None
    role: Role
    created_at: datetime


class AddMemberRequest(BaseModel):
    email: EmailStr
    role: Role


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    customer_id: UUID | None = None


class UpdateProjectRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, pattern="^(draft|in_progress|completed|archived)$")


class ProjectResponse(BaseModel):
    id: UUID
    customer_id: UUID | None
    name: str
    description: str | None
    status: str
    active_version_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectVersionResponse(BaseModel):
    id: UUID
    version_number: int
    label: str | None
    source_type: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateVersionRequest(BaseModel):
    file_id: UUID
    label: str | None = Field(default=None, max_length=200)


class RequestUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=100)
    kind: str


class RequestUploadResponse(BaseModel):
    file_id: UUID
    upload_url: str
    storage_key: str


class FileAssetResponse(BaseModel):
    id: UUID
    kind: str
    mime_type: str
    size_bytes: int | None
    status: str

    model_config = {"from_attributes": True}


class DownloadUrlResponse(BaseModel):
    download_url: str


class CreateCustomerRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    document: str | None = Field(default=None, max_length=30)
    address: dict | None = None
    notes: str | None = Field(default=None, max_length=2000)


class UpdateCustomerRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    document: str | None = Field(default=None, max_length=30)
    address: dict | None = None
    notes: str | None = Field(default=None, max_length=2000)


class CustomerResponse(BaseModel):
    id: UUID
    name: str
    email: str | None
    phone: str | None
    document: str | None
    address: dict | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateCostProfileRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    energy_cost_per_kwh: float = Field(ge=0)
    labor_cost_per_hour: float = Field(ge=0)
    packaging_cost_flat: float = Field(ge=0)
    waste_percentage: float = Field(ge=0)
    fees_percentage: float = Field(ge=0)
    profit_margin_percentage: float = Field(ge=0)
    tax_percentage: float | None = Field(default=None, ge=0)
    is_default: bool = False


class UpdateCostProfileRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    energy_cost_per_kwh: float | None = Field(default=None, ge=0)
    labor_cost_per_hour: float | None = Field(default=None, ge=0)
    packaging_cost_flat: float | None = Field(default=None, ge=0)
    waste_percentage: float | None = Field(default=None, ge=0)
    fees_percentage: float | None = Field(default=None, ge=0)
    profit_margin_percentage: float | None = Field(default=None, ge=0)
    tax_percentage: float | None = Field(default=None, ge=0)
    is_default: bool | None = None


class CostProfileResponse(BaseModel):
    id: UUID
    name: str
    energy_cost_per_kwh: float
    labor_cost_per_hour: float
    packaging_cost_flat: float
    waste_percentage: float
    fees_percentage: float
    profit_margin_percentage: float
    tax_percentage: float | None
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class QuoteExtraItem(BaseModel):
    """Linha da receita: ingrediente do cadastro (com quantidade e unidade da
    receita inteira) ou item avulso. `cost` é o custo POR UNIDADE vendida
    (já dividido pelo rendimento), que entra no cálculo do preço."""

    name: str = Field(max_length=200)
    cost: float = Field(ge=0)
    material_id: str | None = Field(default=None, max_length=64)
    quantity: float | None = Field(default=None, ge=0)
    unit: str | None = Field(default=None, max_length=10)


class QuoteFiring(BaseModel):
    """Dados do forno de uma peça (tempo de forno dividido pelo lote).

    O forno queima várias peças de uma vez, então o tempo de forno e a
    energia de cada peça são a parte dela na fornada:
    horas por queima x número de queimas / peças por fornada.
    `power_usage_percentage` é quanto da potência nominal o forno usa em
    média durante a queima (ele liga e desliga para seguir a curva).
    """

    hours_per_firing: float = Field(ge=0)
    firings: int = Field(default=2, ge=1, le=10)
    batch_size: int = Field(default=1, ge=1)
    power_usage_percentage: float = Field(default=100, ge=0, le=100)


class CreateQuoteRequest(BaseModel):
    cost_profile_id: UUID
    project_id: UUID | None = None
    project_version_id: UUID | None = None
    customer_id: UUID | None = None
    material_cost: float = Field(ge=0)
    print_time_hours: float = Field(ge=0)
    machine_cost_per_hour: float | None = Field(default=None, ge=0)
    machine_id: UUID | None = None
    energy_kwh: float = Field(ge=0)
    labor_hours: float = Field(ge=0)
    piece_name: str | None = Field(default=None, max_length=200)
    printer_name: str | None = Field(default=None, max_length=200)
    weight_g: float | None = Field(default=None, ge=0)
    quantity: int = Field(default=1, ge=1)
    profit_margin_percentage: float | None = Field(default=None, ge=0)
    material_id: UUID | None = None
    cost_per_kg: float | None = Field(default=None, ge=0)
    extra_items: list[QuoteExtraItem] | None = None
    depreciation_mode: str | None = Field(default=None, pattern="^(hora|peca)$")
    depreciation_value: float | None = Field(default=None, ge=0)
    firing: QuoteFiring | None = None

    @model_validator(mode="after")
    def _project_fields_go_together(self) -> "CreateQuoteRequest":
        if (self.project_id is None) != (self.project_version_id is None):
            raise ValueError("Informe project_id e project_version_id juntos, ou nenhum dos dois.")
        return self



class UpdateQuoteRequest(BaseModel):
    piece_name: str | None = Field(default=None, max_length=200)
    printer_name: str | None = Field(default=None, max_length=200)
    machine_id: UUID | None = None
    material_id: UUID | None = None
    weight_g: float | None = Field(default=None, ge=0)
    cost_per_kg: float | None = Field(default=None, ge=0)
    extra_items: list[QuoteExtraItem] | None = None
    print_time_hours: float | None = Field(default=None, ge=0)
    depreciation_mode: str | None = Field(default=None, pattern="^(hora|peca)$")
    depreciation_value: float | None = Field(default=None, ge=0)
    firing: QuoteFiring | None = None
    labor_hours: float | None = Field(default=None, ge=0)
    profit_margin_percentage: float | None = Field(default=None, ge=0)
    quantity: int | None = Field(default=None, ge=1)
    final_price: float | None = Field(default=None, ge=0)


class QuoteResponse(BaseModel):
    id: UUID
    cost_profile_id: UUID
    project_version_id: UUID | None
    customer_id: UUID | None
    piece_name: str | None
    printer_name: str | None
    machine_id: UUID | None
    material_id: UUID | None
    weight_g: float | None
    cost_per_kg: float | None
    extra_items: list[QuoteExtraItem] | None
    print_time_hours: float | None
    depreciation_mode: str | None
    depreciation_value: float | None
    firing: QuoteFiring | None = None
    labor_hours: float | None
    profit_margin_percentage: float | None
    quantity: int
    cost_breakdown_snapshot: dict
    production_cost: float
    suggested_price: float
    final_price: float | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


_ORDER_STATUS_PATTERN = (
    "^(quote|order|paid|production|firing|finishing|packaging|delivered|completed|cancelled)$"
)


class CreateOrderRequest(BaseModel):
    customer_id: UUID
    quote_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)
    due_date: date | None = None
    status: str | None = Field(default=None, pattern=_ORDER_STATUS_PATTERN)


class OrderItemBrief(BaseModel):
    product_id: UUID | None
    quantity: int
    unit_price: float | None


class OrderResponse(BaseModel):
    id: UUID
    customer_id: UUID
    quote_id: UUID | None
    status: str
    production_status: str = "todo"
    due_date: datetime | None = None
    total_amount: float
    notes: str | None
    created_at: datetime
    items: list[OrderItemBrief] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class UpdateOrderRequest(BaseModel):
    customer_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)
    due_date: date | None = None
    clear_due_date: bool = False
    production_status: str | None = Field(default=None, pattern="^(todo|doing|done)$")
    status: str | None = Field(default=None, pattern=_ORDER_STATUS_PATTERN)


class TransitionOrderStatusRequest(BaseModel):
    status: str = Field(pattern=_ORDER_STATUS_PATTERN)


class CreateOrderItemRequest(BaseModel):
    project_id: UUID | None = None
    project_version_id: UUID | None = None
    product_id: UUID | None = None
    machine_id: UUID | None = None
    material_id: UUID | None = None
    quantity: int = Field(default=1, ge=1)
    unit_cost: float | None = Field(default=None, ge=0)
    unit_price: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _project_fields_go_together(self) -> "CreateOrderItemRequest":
        if (self.project_id is None) != (self.project_version_id is None):
            raise ValueError("Informe project_id e project_version_id juntos, ou nenhum dos dois.")
        return self


class UpdateOrderItemRequest(BaseModel):
    product_id: UUID | None = None
    quantity: int | None = Field(default=None, ge=1)
    unit_cost: float | None = Field(default=None, ge=0)
    unit_price: float | None = Field(default=None, ge=0)


class OrderItemResponse(BaseModel):
    id: UUID
    order_id: UUID
    project_version_id: UUID | None
    product_id: UUID | None
    machine_id: UUID | None
    material_id: UUID | None
    quantity: int
    unit_cost: float | None
    unit_price: float | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CustomerHistoryResponse(BaseModel):
    quotes: list[QuoteResponse]
    projects: list[ProjectResponse]
    orders: list[OrderResponse]


class CreateMaterialRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    type: str = Field(min_length=2, max_length=30)
    color: str | None = Field(default=None, max_length=50)
    density_g_cm3: float | None = Field(default=None, gt=0)
    cost_per_kg: float | None = Field(default=None, ge=0)
    supplier: str | None = Field(default=None, max_length=200)


class UpdateMaterialRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    type: str | None = Field(default=None, min_length=2, max_length=30)
    color: str | None = Field(default=None, max_length=50)
    density_g_cm3: float | None = Field(default=None, gt=0)
    cost_per_kg: float | None = Field(default=None, ge=0)
    supplier: str | None = Field(default=None, max_length=200)


class MaterialResponse(BaseModel):
    id: UUID
    name: str
    type: str
    color: str | None
    density_g_cm3: float | None
    cost_per_kg: float | None
    supplier: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductMaterialInput(BaseModel):
    material_id: UUID
    quantity_g: float = Field(gt=0)


class PhotoFocus(BaseModel):
    url: str = Field(max_length=2000)
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)


class CreateProductRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    print_time_hours: float | None = Field(default=None, ge=0)
    machine_id: UUID | None = None
    manual_price: float | None = Field(default=None, ge=0)
    size: str | None = Field(default=None, max_length=100)
    photo_urls: list[str] = Field(default_factory=list)
    stock_quantity: int | None = Field(default=None, ge=0)
    materials: list[ProductMaterialInput] = Field(default_factory=list)
    # False = o produto nasce oculto na loja pública e só aparece quando o
    # lojista o publica manualmente (Minha Loja → Produtos na loja → Mostrar).
    publish_in_store: bool = True


class UpdateProductRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    print_time_hours: float | None = Field(default=None, ge=0)
    machine_id: UUID | None = None
    manual_price: float | None = Field(default=None, ge=0)
    size: str | None = Field(default=None, max_length=100)
    photo_urls: list[str] | None = None
    photo_focus: list[PhotoFocus] | None = None
    stock_quantity: int | None = Field(default=None, ge=0)
    materials: list[ProductMaterialInput] | None = None


class ProductMaterialResponse(BaseModel):
    material_id: UUID
    quantity_g: float


class ProductResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    print_time_hours: float | None
    machine_id: UUID | None
    manual_price: float | None
    size: str | None
    photo_urls: list[str] = Field(default_factory=list)
    photo_focus: list[PhotoFocus] = Field(default_factory=list)
    stock_quantity: int | None
    is_active: bool
    created_at: datetime
    materials: list[ProductMaterialResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ProductCostItem(BaseModel):
    product_id: UUID
    material_cost: float
    waste_cost: float
    energy_cost: float
    machine_cost: float
    labor_cost: float
    packaging_cost: float
    fees: float
    production_cost: float
    tax_amount: float
    suggested_price: float
    source: str = "recipe"


class ProductCostResponse(BaseModel):
    material_cost: float
    waste_cost: float
    energy_cost: float
    machine_cost: float
    labor_cost: float
    packaging_cost: float
    fees: float
    production_cost: float
    tax_amount: float
    suggested_price: float
    source: str = "recipe"


class CreateInventoryItemRequest(BaseModel):
    material_id: UUID | None = None
    name: str = Field(min_length=2, max_length=200)
    category: str = Field(pattern="^(ingrediente|embalagem|decoracao|ferramenta|outro)$")
    unit: str = Field(pattern="^(g|kg|un)$")
    minimum_stock: float = Field(default=0, ge=0)
    unit_cost: float | None = Field(default=None, ge=0)
    supplier: str | None = Field(default=None, max_length=200)
    initial_quantity: float = Field(default=0, ge=0)


class UpdateInventoryItemRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    minimum_stock: float | None = Field(default=None, ge=0)
    unit_cost: float | None = Field(default=None, ge=0)
    supplier: str | None = Field(default=None, max_length=200)


class InventoryItemResponse(BaseModel):
    id: UUID
    material_id: UUID | None
    name: str
    category: str
    quantity_on_hand: float
    unit: str
    minimum_stock: float
    unit_cost: float | None
    supplier: str | None
    created_at: datetime
    is_low_stock: bool = False

    model_config = {"from_attributes": True}


class CreateInventoryMovementRequest(BaseModel):
    type: str = Field(pattern="^(entrada|saida|ajuste|consumo|perda)$")
    quantity: float
    unit_cost: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=2000)
    reference_order_id: UUID | None = None


class InventoryMovementResponse(BaseModel):
    id: UUID
    inventory_item_id: UUID
    type: str
    quantity: float
    unit_cost: float | None
    notes: str | None
    reference_order_id: UUID | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateFinancialTransactionRequest(BaseModel):
    type: str = Field(pattern="^(receita|custo|despesa)$")
    category: str = Field(min_length=2, max_length=50)
    cost_center: str | None = Field(default=None, max_length=100)
    amount: float = Field(gt=0)
    reference_order_id: UUID | None = None
    due_date: date | None = None
    mark_as_paid: bool = False


class UpdateFinancialTransactionRequest(BaseModel):
    category: str | None = Field(default=None, min_length=2, max_length=50)
    cost_center: str | None = Field(default=None, max_length=100)
    amount: float | None = Field(default=None, gt=0)
    due_date: date | None = None


class FinancialTransactionResponse(BaseModel):
    id: UUID
    type: str
    category: str
    cost_center: str | None
    amount: float
    reference_order_id: UUID | None
    due_date: date | None
    paid_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FinancialSummaryResponse(BaseModel):
    total_revenue: float
    total_cost: float
    total_expense: float
    profit: float
    pending_receivables: float
    pending_payables: float


class DashboardResponse(BaseModel):
    orders_by_status: dict[str, int]
    low_stock_items_count: int
    customers_count: int
    projects_count: int
    financial: FinancialSummaryResponse


class CreateMachineRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    technology: str = Field(pattern="^(forno_eletrico|forno_gas|batedeira|torno|outro)$")
    build_volume_x_mm: float | None = Field(default=None, gt=0)
    build_volume_y_mm: float | None = Field(default=None, gt=0)
    build_volume_z_mm: float | None = Field(default=None, gt=0)
    power_watts: float | None = Field(default=None, ge=0)
    cost_per_hour: float | None = Field(default=None, ge=0)
    speed_profile: dict | None = None
    compatible_materials: list[str] | None = None


class UpdateMachineRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    cost_per_hour: float | None = Field(default=None, ge=0)
    power_watts: float | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(active|maintenance|inactive)$")


class MachineResponse(BaseModel):
    id: UUID
    name: str
    brand: str | None
    model: str | None
    technology: str
    build_volume_x_mm: float | None
    build_volume_y_mm: float | None
    build_volume_z_mm: float | None
    power_watts: float | None
    cost_per_hour: float | None
    speed_profile: dict | None
    compatible_materials: list[str] | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PlanResponse(BaseModel):
    id: UUID
    code: str
    name: str
    is_active: bool
    trial_period_days: int | None

    model_config = {"from_attributes": True}


class SubscriptionResponse(BaseModel):
    id: UUID
    plan: PlanResponse
    status: str
    current_period_start: datetime
    current_period_end: datetime
    trial_start: datetime | None
    trial_end: datetime | None
    cancel_at_period_end: bool
    canceled_at: datetime | None

    model_config = {"from_attributes": True}


class CancelSubscriptionRequest(BaseModel):
    at_period_end: bool = True


class ChangePlanRequest(BaseModel):
    plan_code: str = Field(min_length=2, max_length=50)


class UsageItemResponse(BaseModel):
    key: str
    limit_type: str
    current_usage: float | None
    limit: float | None
    enabled: bool | None


class ImageUploadResponse(BaseModel):
    url: str


class StoreSlide(BaseModel):
    url: str = Field(max_length=2000)
    title: str = Field(default="", max_length=120)
    subtitle: str = Field(default="", max_length=240)
    # Enquadramento da foto (0-100). Sem valores = foto inteira, sem corte (padrão).
    x: float | None = Field(default=None, ge=0, le=100)
    y: float | None = Field(default=None, ge=0, le=100)
    # Versão da arte para celular (em pé). Vazio = usa a mesma foto.
    mobile_url: str = Field(default="", max_length=2000)
    # Ao tocar na capa: "" = abre o cardápio; "whatsapp" = conversa de
    # encomenda; ou um link https.
    link: str = Field(default="", max_length=600)


class StoreFestival(BaseModel):
    """Um dia de Festival de Fatias (ou feira/evento) com local e horário."""

    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    place: str = Field(min_length=1, max_length=120)
    time: str = Field(default="", max_length=40)
    note: str = Field(default="", max_length=160)
    maps_url: str = Field(default="", max_length=600)


class StoreLocation(BaseModel):
    """Ponto fixo onde a loja costuma estar (festival, feira, retirada)."""

    name: str = Field(min_length=1, max_length=120)
    address: str = Field(default="", max_length=240)
    schedule: str = Field(default="", max_length=160)
    maps_url: str = Field(default="", max_length=600)


# Loja recém-criada já abre pronta: capa do Festival de Fatias, os dois locais
# e o calendário de novembro/dezembro postado no Instagram da Winner Cakes.
_DEFAULT_SLIDES = [
    {
        "url": "/brand/slide-festival.jpg",
        "title": "",
        "subtitle": "",
        "mobile_url": "/brand/slide-festival-celular.jpg",
    },
    {
        "url": "/brand/slide-encomendas.jpg",
        "title": "",
        "subtitle": "",
        "mobile_url": "/brand/slide-encomendas-celular.jpg",
        "link": "whatsapp",
    },
]
_DEFAULT_LOCATIONS = [
    {
        "name": "Festival Bay Market - NIT",
        "address": "Niterói",
        "maps_url": "https://maps.app.goo.gl/xB4gRjvGaTRma4xK6",
    },
    {
        "name": "Festival Nova Cidade - SG",
        "address": "São Gonçalo",
        "maps_url": "https://maps.app.goo.gl/zXGEMu8X6GUfnawV6",
    },
]
_DEFAULT_FESTIVALS = [
    {"date": d, "place": "Festival Bay Market - NIT", "time": "a partir das 13h"}
    for d in (
        "2026-11-13", "2026-11-16", "2026-11-18", "2026-11-25", "2026-11-27",
        "2026-12-02", "2026-12-04", "2026-12-09", "2026-12-11",
        "2026-12-16", "2026-12-18", "2026-12-21", "2026-12-23",
    )
] + [
    {
        "date": "2026-12-05",
        "place": "Festival Nova Cidade - SG",
        "time": "a partir das 13h",
        "note": "Exclusivo Nova Cidade",
    }
]


class StoreFlavor(BaseModel):
    """Um sabor (ex.: de fatia) mostrado no quadro "Sabores" da vitrine."""

    name: str = Field(min_length=1, max_length=80)
    photo_url: str = Field(default="", max_length=2000)


class StoreGalleryPhoto(BaseModel):
    url: str = Field(max_length=2000)
    caption: str = Field(default="", max_length=120)


_DEFAULT_FLAVORS = [
    ("Chocolatuda", "/brand/sabores/chocolatuda.jpg"),
    ("Maracujá com chocolate", "/brand/sabores/maracuja-com-chocolate.jpg"),
    ("Matilda cake", "/brand/sabores/matilda-cake.jpg"),
    ("Abacaxi com coco", "/brand/sabores/abacaxi-com-coco.jpg"),
    ("Abacaxi com ninho", "/brand/sabores/abacaxi-com-ninho.jpg"),
    ("Abacaxi com doce de leite", "/brand/sabores/abacaxi-com-doce-de-leite.jpg"),
    ("Bolo pudim", "/brand/sabores/bolo-pudim.jpg"),
    ("Olho de sogra", "/brand/sabores/olho-de-sogra.jpg"),
    ("Nozes", "/brand/sabores/nozes.jpg"),
    ("Rafaello", "/brand/sabores/rafaello.jpg"),
    ("Doce de leite crocante", "/brand/sabores/doce-de-leite-crocante.jpg"),
    ("Ninho com Nutella", "/brand/sabores/ninho-com-nutella.jpg"),
    ("Maracujá com ninho", "/brand/sabores/maracuja-com-ninho.jpg"),
    ("Morango com ninho", "/brand/sabores/morango-com-ninho.jpg"),
    ("Maracujá com morango", "/brand/sabores/maracuja-com-morango.jpg"),
    ("Morango com chocolate", "/brand/sabores/morango-com-chocolate.jpg"),
    ("Ovomaltine", "/brand/sabores/ovomaltine.jpg"),
    ("Kinder Bueno", "/brand/sabores/kinder-bueno.jpg"),
    ("Ferrero Rocher", "/brand/sabores/ferrero-rocher.jpg"),
]
_DEFAULT_GALLERY = [
    ("/brand/galeria/bolo-lacos.jpg", "Bolo com laços e docinhos"),
    ("/brand/galeria/bolo-capivara.jpg", "Bolo temático de aniversário"),
    ("/brand/galeria/bolo-chantilly.jpg", "Bolo de chantilly com gotas de chocolate"),
    ("/brand/galeria/docinhos.jpg", "Docinhos para festa"),
    ("/brand/galeria/winner-docinhos.jpg", "Encomenda de docinhos pronta"),
]


class CartTier(BaseModel):
    """Desconto progressivo: `percent`% no pedido a partir de `min_total` reais."""

    min_total: float = Field(gt=0, le=1_000_000)
    percent: float = Field(gt=0, le=90)


class StoreHighlight(BaseModel):
    title: str = Field(default="", max_length=80)
    text: str = Field(default="", max_length=240)


class StoreCategory(BaseModel):
    """Categoria da vitrine: criada e renomeada pelo lojista, guarda os ids

    dos produtos que pertencem a ela (um produto pode estar em várias).
    """

    id: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=60)
    product_ids: list[str] = Field(default_factory=list)
    # Foto principal da categoria na vitrine (URL escolhida pelo lojista).
    # Vazio = automática (primeira foto dos produtos da categoria).
    cover_url: str = Field(default="", max_length=2000)
    # Enquadramento da foto principal (ponto de foco, 0-100; 50/50 = centro).
    cover_x: float = Field(default=50, ge=0, le=100)
    cover_y: float = Field(default=50, ge=0, le=100)
    # Subcategoria: id da categoria principal a que pertence ("" = principal).
    parent_id: str = Field(default="", max_length=40)


class StoreSettings(BaseModel):
    """Everything the shop owner manages for the public storefront; stored

    under `Organization.settings["store"]`.
    """

    display_name: str = Field(default="", max_length=120)
    logo_url: str = Field(default="/brand/winner-logo.png", max_length=2000)
    tagline: str = Field(
        default="Confeitaria artesanal | Toda semana tem Festival de Fatias", max_length=200
    )
    about: str = Field(default="", max_length=2000)
    whatsapp: str = Field(default="5521980117688", max_length=20)
    instagram: str = Field(default="winnercakes", max_length=120)
    hours: str = Field(default="", max_length=300)
    address: str = Field(default="", max_length=300)
    accent: str = Field(default="vermelho", max_length=20)
    theme: str = Field(default="winner", pattern="^(light|dark|winner)$")
    slides: list[StoreSlide] = Field(
        default_factory=lambda: [StoreSlide(**s) for s in _DEFAULT_SLIDES], max_length=10
    )
    highlights: list[StoreHighlight] = Field(default_factory=list, max_length=3)
    # Links de Reels/posts do Instagram mostrados na vitrine (vídeos incorporados).
    reels: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("reels")
    @classmethod
    def _only_instagram_links(cls, value: list[str]) -> list[str]:
        import re

        pattern = re.compile(r"^https://(www\.)?instagram\.com/([A-Za-z0-9_.]+/)?(reel|reels|p|tv)/[A-Za-z0-9_-]+")
        cleaned = [link.strip() for link in value if link.strip()]
        for link in cleaned:
            if len(link) > 300 or not pattern.match(link):
                raise ValueError(f"Link do Instagram inválido: {link[:80]}")
        return cleaned

    @model_validator(mode="after")
    def _only_two_category_levels(self) -> "StoreSettings":
        """Menu em dois níveis: a categoria-mãe precisa existir e ser principal.

        Vínculos inválidos (mãe apagada, a própria categoria, ou uma mãe que
        também é subcategoria) são desfeitos em vez de recusar o salvamento.
        """
        by_id = {c.id: c for c in self.categories}
        for c in self.categories:
            parent = by_id.get(c.parent_id) if c.parent_id else None
            if parent is None or parent.id == c.id:
                c.parent_id = ""
        for c in self.categories:
            if c.parent_id and by_id[c.parent_id].parent_id:
                c.parent_id = ""
        return self

    hidden_product_ids: list[str] = Field(default_factory=list)
    # A ordem desta lista é a ordem dos destaques na vitrine.
    featured_product_ids: list[str] = Field(default_factory=list)
    # Ordem personalizada dos produtos na vitrine (ids). Produtos que não estão
    # na lista (novos) aparecem depois, na ordem de cadastro.
    product_order: list[str] = Field(default_factory=list)
    # Produtos exibidos como "Preço a consultar" na loja pública.
    price_on_request_product_ids: list[str] = Field(default_factory=list)
    categories: list[StoreCategory] = Field(default_factory=list, max_length=30)
    # Segue o modo escuro do celular/computador do cliente na vitrine.
    auto_dark: bool = False
    # Selos de confiança mostrados na vitrine e no pedido.
    trust_badges: list[str] = Field(
        default_factory=lambda: [
            "Feito à mão, peça por peça",
            "Envio para todo o Brasil",
            "Pagamento combinado no WhatsApp",
        ],
        max_length=6,
    )
    # Prazo de produção mostrado na vitrine (ex.: "7 a 10 dias úteis"). Vazio = não mostra.
    production_days: str = Field(default="até 60 dias úteis", max_length=80)
    # Modelo 3D (.glb) de cada produto: {id do produto: link https}.
    model_urls: dict[str, str] = Field(default_factory=dict)
    # Descontos (% OFF) por produto: {id do produto: porcentagem}.
    product_discounts: dict[str, float] = Field(default_factory=dict)
    # Promoção geral (ex.: Black Friday 10% em tudo), com datas opcionais
    # (AAAA-MM-DD, horário de Brasília; vazio = sem limite).
    promo_percent: float = Field(default=0, ge=0, le=90)
    promo_label: str = Field(default="", max_length=60)
    promo_start: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    promo_end: str = Field(default="", pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    # Descontos progressivos no pedido (ex.: 20% a partir de R$ 500).
    cart_tiers: list[CartTier] = Field(default_factory=list, max_length=5)
    # False: vale só o maior desconto (do produto/promoção OU da faixa do pedido).
    discounts_stack: bool = False
    # Produtos fora das promoções (geral e por valor do pedido). O desconto
    # próprio do produto, se houver, continua valendo.
    promo_excluded_ids: list[str] = Field(default_factory=list)
    # Fundo da loja: "none" (liso), "tijolos" (parede rústica) ou "foto" (uma
    # foto enviada). Intensidade em % (quanto aparece) e se vai no cabeçalho.
    background_style: str = Field(default="none", pattern="^(none|tijolos|foto)$")
    background_url: str = Field(default="", max_length=2000)
    background_opacity: int = Field(default=18, ge=3, le=60)
    background_header: bool = False
    # Parcelamento sem juros mostrado embaixo do preço: até N vezes (0 = não
    # mostra), com parcela mínima de R$ X.
    installments_max: int = Field(default=0, ge=0, le=24)
    installments_min: float = Field(default=0, ge=0, le=100_000)
    # Calendário dos Festivais de Fatias e os locais onde a loja está.
    festivals: list[StoreFestival] = Field(
        default_factory=lambda: [StoreFestival(**f) for f in _DEFAULT_FESTIVALS], max_length=120
    )
    locations: list[StoreLocation] = Field(
        default_factory=lambda: [StoreLocation(**loc) for loc in _DEFAULT_LOCATIONS], max_length=20
    )
    # Aviso embaixo do calendário (horário, "até acabarem as fatias"...).
    festival_note: str = Field(
        default=(
            "Abrimos sempre às 13h e ficamos até encerrarem as fatias! "
            "Na última semana de dezembro não teremos festival."
        ),
        max_length=300,
    )
    # Quadro de sabores e galeria de fotos (encomendas, festas, festivais).
    flavors: list[StoreFlavor] = Field(
        default_factory=lambda: [StoreFlavor(name=n, photo_url=u) for n, u in _DEFAULT_FLAVORS],
        max_length=60,
    )
    flavors_title: str = Field(default="Sabores das fatias", max_length=80)
    gallery: list[StoreGalleryPhoto] = Field(
        default_factory=lambda: [StoreGalleryPhoto(url=u, caption=c) for u, c in _DEFAULT_GALLERY],
        max_length=30,
    )

    @field_validator("product_discounts")
    @classmethod
    def _valid_product_discounts(cls, value: dict[str, float]) -> dict[str, float]:
        cleaned = {k: round(float(v), 2) for k, v in value.items() if v and float(v) > 0}
        for pct in cleaned.values():
            if pct > 90:
                raise ValueError("O desconto de um produto pode ser de no máximo 90%.")
        return cleaned

    @field_validator("trust_badges")
    @classmethod
    def _clean_badges(cls, value: list[str]) -> list[str]:
        cleaned = [b.strip() for b in value if b.strip()]
        for badge in cleaned:
            if len(badge) > 60:
                raise ValueError("Cada selo pode ter no máximo 60 letras.")
        return cleaned

    @field_validator("model_urls")
    @classmethod
    def _only_https_models(cls, value: dict[str, str]) -> dict[str, str]:
        cleaned = {k: v.strip() for k, v in value.items() if v and v.strip()}
        if len(cleaned) > 500:
            raise ValueError("Modelos 3D demais.")
        for link in cleaned.values():
            bad = not link.startswith("https://") or any(c.isspace() for c in link)
            if len(link) > 2000 or bad:
                raise ValueError(f"Link do modelo 3D inválido: {link[:80]}")
        return cleaned


class StoreAdminResponse(BaseModel):
    slug: str
    name: str
    settings: StoreSettings


class PublicProduct(BaseModel):
    id: UUID
    name: str
    description: str | None
    size: str | None
    photo_urls: list[str]
    photo_focus: list[PhotoFocus]
    price: float
    stock_quantity: int | None
    available: bool
    featured: bool
    category_ids: list[str] = Field(default_factory=list)
    # Quando True, `price` vem 0 — o valor real não é exposto publicamente.
    price_on_request: bool = False
    # Link do modelo 3D (.glb) do produto, quando houver.
    model_url: str = ""
    # Desconto em vigor no produto (% OFF): o maior entre o do produto e o da
    # promoção geral ativa. `price` continua sendo o preço cheio.
    discount_percent: float = 0
    # Fora das promoções gerais e do desconto por valor do pedido.
    promo_excluded: bool = False


class StorePing(BaseModel):
    """Sinal de vida de um visitante da vitrine (anônimo)."""

    visitor_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    # True na primeira abertura da loja numa sessão: conta como uma visita.
    new_visit: bool = False


class StoreEvent(BaseModel):
    """Ação de um visitante na vitrine (anônima)."""

    kind: Literal["product_view", "whatsapp_click"]
    product_id: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9-]+$")


class StoreVisitTotals(BaseModel):
    views: int
    # Pessoas diferentes por dia, somadas (quem volta em outro dia conta de novo).
    unique: int
    whatsapp: int = 0


class StoreVisitDay(BaseModel):
    date: str
    views: int
    unique: int
    whatsapp: int = 0


class StoreTopProduct(BaseModel):
    product_id: str
    name: str
    views: int  # últimos 30 dias
    views7: int  # últimos 7 dias


class StoreOnlineResponse(BaseModel):
    online: int


class StoreAnalyticsResponse(BaseModel):
    online: int
    today: StoreVisitTotals
    last7: StoreVisitTotals
    last30: StoreVisitTotals
    days: list[StoreVisitDay]
    top_products: list[StoreTopProduct] = Field(default_factory=list)


class PublicCategory(BaseModel):
    id: str
    name: str
    cover_url: str = ""
    cover_x: float = 50
    cover_y: float = 50
    parent_id: str = ""


class PublicStoreSettings(BaseModel):
    display_name: str
    logo_url: str
    tagline: str
    about: str
    whatsapp: str
    instagram: str
    hours: str
    address: str
    accent: str
    theme: str
    slides: list[StoreSlide]
    highlights: list[StoreHighlight]
    reels: list[str] = Field(default_factory=list)
    categories: list[PublicCategory] = Field(default_factory=list)
    # Ids dos destaques visíveis, já na ordem escolhida pelo lojista.
    featured_product_ids: list[str] = Field(default_factory=list)
    auto_dark: bool = False
    trust_badges: list[str] = Field(default_factory=list)
    production_days: str = ""
    # Promoção geral só aparece quando está valendo hoje.
    promo_percent: float = 0
    promo_label: str = ""
    promo_end: str = ""
    cart_tiers: list[CartTier] = Field(default_factory=list)
    discounts_stack: bool = False
    background_style: str = "none"
    background_url: str = ""
    background_opacity: int = 18
    background_header: bool = False
    installments_max: int = 0
    installments_min: float = 0
    # Só os festivais de hoje em diante, em ordem de data.
    festivals: list[StoreFestival] = Field(default_factory=list)
    locations: list[StoreLocation] = Field(default_factory=list)
    festival_note: str = ""
    flavors: list[StoreFlavor] = Field(default_factory=list)
    flavors_title: str = ""
    gallery: list[StoreGalleryPhoto] = Field(default_factory=list)


class PublicStoreResponse(BaseModel):
    slug: str
    name: str
    settings: PublicStoreSettings
    products: list[PublicProduct]
