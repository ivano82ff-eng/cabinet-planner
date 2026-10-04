<?php
/**
 * Plugin Name: Cabinet Planner Bridge
 * Description: Передаёт заказы WooCommerce в планировщик корпусной мебели.
 * Version: 1.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('woocommerce_order_status_processing', 'cabinet_planner_push_order');

function cabinet_planner_push_order($order_id): void
{
    if (!function_exists('wc_get_order')) {
        return;
    }

    $order = wc_get_order($order_id);
    if (!$order instanceof WC_Order) {
        return;
    }

    $endpoint = apply_filters(
        'cabinet_planner_endpoint',
        'http://127.0.0.1:3001/api/integrations/woocommerce'
    );
    $secret = apply_filters('cabinet_planner_secret', 'dev-secret');
    $items = [];

    foreach ($order->get_items() as $item) {
        if (!$item instanceof WC_Order_Item_Product) {
            continue;
        }
        $meta = [];
        foreach ($item->get_meta_data() as $row) {
            $data = $row->get_data();
            $meta[] = [
                'key' => (string) $data['key'],
                'value' => $data['value'],
            ];
        }
        $product = $item->get_product();
        $items[] = [
            'name' => $item->get_name(),
            'sku' => $product ? $product->get_sku() : '',
            'meta_data' => $meta,
        ];
    }

    $response = wp_remote_post($endpoint, [
        'timeout' => 15,
        'headers' => [
            'Content-Type' => 'application/json',
            'X-WC-Webhook-Secret' => $secret,
        ],
        'body' => wp_json_encode([
            'id' => $order->get_id(),
            'billing' => [
                'first_name' => $order->get_billing_first_name(),
                'last_name' => $order->get_billing_last_name(),
                'email' => $order->get_billing_email(),
            ],
            'line_items' => $items,
        ]),
    ]);

    if (is_wp_error($response)) {
        $order->add_order_note('Планировщик: ' . $response->get_error_message());
        return;
    }

    $order->add_order_note(
        'Планировщик ответил HTTP ' . wp_remote_retrieve_response_code($response) . '. '
        . wp_remote_retrieve_body($response)
    );
}
