"""Order quantity rules: litres, local gallons and the approved presets (FR-021).

Rules (SRS v0.2, FR-021):

- Quantities are stored in whole **litres**. The local unit is the **local
  gallon, which is exactly 4 litres**, so converting gallons to litres never
  produces a fraction.
- A customer may order a preset or a custom quantity, entered in litres or
  local gallons. The server converts and validates it; whatever the client
  showed is display only.
- The minimum order is **600 litres** (150 local gallons). The upper bound,
  :data:`MAX_ORDER_LITRES`, only rejects nonsense input: whether a large
  quantity can be delivered depends on vehicle capacity and trips (FR-013),
  which are not modelled yet, so every order is still a manual quote request.

The database constraint on ``orders.quantity_litres`` stays at 1-100000
litres (``models.MIN_QUANTITY_LITRES``): requests below 600 litres were valid
before v0.2 and still exist. The 600-litre minimum applies to new orders and
is enforced by the request schema.
"""

from app.modules.orders.models import MAX_QUANTITY_LITRES

LITRES_PER_LOCAL_GALLON = 4
MIN_ORDER_LITRES = 600
MAX_ORDER_LITRES = MAX_QUANTITY_LITRES
MIN_ORDER_LOCAL_GALLONS = MIN_ORDER_LITRES // LITRES_PER_LOCAL_GALLON
MAX_ORDER_LOCAL_GALLONS = MAX_ORDER_LITRES // LITRES_PER_LOCAL_GALLON

# Approved pilot presets in litres (FR-021): 150, 300, 500, 750, 1,000 and
# 1,250 local gallons. The customer screens show the same values.
PRESET_LITRES: tuple[int, ...] = (600, 1_200, 2_000, 3_000, 4_000, 5_000)


def litres_from_local_gallons(local_gallons: int) -> int:
    """Convert local gallons to litres (1 local gallon = 4 litres, FR-021).

    Args:
        local_gallons: Whole local gallons.

    Returns:
        The same quantity in litres.
    """
    return local_gallons * LITRES_PER_LOCAL_GALLON
