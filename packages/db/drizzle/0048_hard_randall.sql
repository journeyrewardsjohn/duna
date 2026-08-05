ALTER TABLE "catalog_fulfillments" DROP CONSTRAINT "catalog_fulfillment_kind_valid";--> statement-breakpoint
ALTER TABLE "catalog_items" DROP CONSTRAINT "catalog_item_subtype_valid";--> statement-breakpoint
ALTER TABLE "catalog_items" DROP CONSTRAINT "catalog_item_payment_method";--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "total_cost_minor" bigint;--> statement-breakpoint
ALTER TABLE "catalog_fulfillments" ADD CONSTRAINT "catalog_fulfillment_kind_valid" CHECK ("catalog_fulfillments"."kind" IN ('registration', 'appointment', 'pickup', 'shipment', 'rental', 'membership', 'credit-grant', 'package'));--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_item_subtype_valid" CHECK (("catalog_items"."type" = 'event' AND "catalog_items"."subtype" IN ('tournament', 'league', 'clinic', 'open-play', 'pickup')) OR ("catalog_items"."type" = 'service' AND "catalog_items"."subtype" IN ('private-lesson', 'group-lesson', 'program', 'court-rental', 'assessment', 'other')) OR ("catalog_items"."type" = 'good' AND "catalog_items"."subtype" IN ('apparel', 'equipment', 'rental', 'swag', 'consumable', 'other')) OR ("catalog_items"."type" = 'plan' AND "catalog_items"."subtype" IN ('membership', 'credit-pack', 'bundle')));--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_item_payment_method" CHECK ("catalog_items"."allow_card" OR "catalog_items"."allow_cash" OR "catalog_items"."allow_credits" OR ("catalog_items"."type" = 'good' AND "catalog_items"."configuration" ->> 'saleEnabled' = 'false'));--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movement_cost_valid" CHECK (("inventory_movements"."unit_cost_minor" IS NULL AND "inventory_movements"."total_cost_minor" IS NULL) OR ("inventory_movements"."unit_cost_minor" >= 0 AND ("inventory_movements"."total_cost_minor" IS NULL OR "inventory_movements"."total_cost_minor" >= 0) AND "inventory_movements"."currency" IS NOT NULL));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "duna_reserve_catalog_inventory"(
  p_organization_id uuid,
  p_catalog_variant_id uuid,
  p_order_id uuid,
  p_purpose text,
  p_quantity integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_stock inventory_stock_items%ROWTYPE;
  v_existing integer;
  v_remaining integer := p_quantity;
  v_take integer;
  v_costing_method text;
BEGIN
  IF p_quantity <= 0
     OR p_ends_at <= p_starts_at
     OR p_purpose NOT IN ('sale', 'rental') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'inventory_reservation_invalid';
  END IF;

  SELECT CASE
           WHEN lower(COALESCE(max(i.configuration ->> 'inventoryCostingMethod'), 'fifo')) = 'lifo'
             THEN 'lifo'
           ELSE 'fifo'
         END
    INTO v_costing_method
    FROM catalog_variants AS v
    JOIN catalog_items AS i
      ON i.id = v.catalog_item_id
     AND i.organization_id = p_organization_id
   WHERE v.id = p_catalog_variant_id
     AND v.organization_id = p_organization_id;

  SELECT COALESCE(sum(r.quantity), 0)::integer
    INTO v_existing
    FROM inventory_reservations AS r
   WHERE r.organization_id = p_organization_id
     AND r.source_type = 'catalog-order'
     AND r.source_id = p_order_id::text
     AND r.status = 'held';

  IF v_existing = p_quantity THEN
    RETURN;
  ELSIF v_existing <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'inventory_reservation_conflict';
  END IF;

  FOR v_stock IN
    SELECT s.*
      FROM inventory_stock_items AS s
     WHERE s.organization_id = p_organization_id
       AND s.catalog_variant_id = p_catalog_variant_id
       AND s.purpose = p_purpose::inventory_purpose
       AND s.quantity_on_hand > s.quantity_reserved
     ORDER BY
       CASE WHEN v_costing_method = 'lifo'
         THEN COALESCE(s.acquired_at, s.created_at::date)
       END DESC,
       CASE WHEN v_costing_method = 'lifo' THEN s.created_at END DESC,
       CASE WHEN v_costing_method = 'fifo'
         THEN COALESCE(s.acquired_at, s.created_at::date)
       END ASC,
       CASE WHEN v_costing_method = 'fifo' THEN s.created_at END ASC,
       s.id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;
    v_take := LEAST(
      v_remaining,
      v_stock.quantity_on_hand - v_stock.quantity_reserved
    );

    UPDATE inventory_stock_items
       SET quantity_reserved = quantity_reserved + v_take,
           updated_at = p_starts_at
     WHERE id = v_stock.id;

    INSERT INTO inventory_reservations (
      id,
      organization_id,
      inventory_stock_item_id,
      quantity,
      starts_at,
      ends_at,
      source_type,
      source_id,
      status,
      held_until,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      p_organization_id,
      v_stock.id,
      v_take,
      p_starts_at,
      p_ends_at,
      'catalog-order',
      p_order_id::text,
      'held',
      p_ends_at,
      p_starts_at,
      p_starts_at
    );

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'inventory_unavailable';
  END IF;
END;
$function$;
