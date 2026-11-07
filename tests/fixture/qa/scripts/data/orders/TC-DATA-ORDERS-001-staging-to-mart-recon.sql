{{ config(tags=['recon'], severity='error', meta={'tc_id': 'TC-DATA-ORDERS-001'}) }}

-- Hop: raw_prepared.stg_orders -> prepared.fct_orders (dedup, latest _loaded_at wins).
-- Tolerance: exact. Returns the keys whose latest staged row differs from the mart row.
with latest as (
    select *, row_number() over (partition by order_id order by _loaded_at desc) as _rn
    from {{ ref('stg_orders') }}
    where {{ settled_before('_loaded_at') }}
),

expected as (
    select order_id, {{ normalized_row_hash(['order_id', 'status', 'order_total']) }} as crc
    from latest where _rn = 1
),

actual as (
    select order_id, {{ normalized_row_hash(['order_id', 'status', 'order_total']) }} as crc
    from {{ ref('fct_orders') }}
    where {{ settled_before('ordered_at') }}
)

select coalesce(e.order_id, a.order_id) as order_id, e.crc as expected_crc, a.crc as actual_crc
from expected e
full outer join actual a on e.order_id = a.order_id
where e.crc is null or a.crc is null or e.crc != a.crc
