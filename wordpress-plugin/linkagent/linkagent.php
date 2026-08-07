<?php
/**
 * Plugin Name: Linkagent
 * Plugin URI: https://github.com/mehicned/linkagent
 * Description: Internal linking on autopilot. Adds the Linkagent script that injects approved internal links by wrapping text already on your pages. No content rewrites, no layout shift.
 * Version: 1.0.0
 * Author: Linkagent
 * Author URI: https://github.com/mehicned/linkagent
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: linkagent
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const LINKAGENT_DEFAULT_HOST = 'https://linkagent-mehicneds-projects.vercel.app';

function linkagent_get_key() {
	return trim( (string) get_option( 'linkagent_site_key', '' ) );
}

function linkagent_get_host() {
	$host = trim( (string) get_option( 'linkagent_host', '' ) );
	return $host ? untrailingslashit( esc_url_raw( $host ) ) : LINKAGENT_DEFAULT_HOST;
}

/**
 * Print the embed script in the footer of public pages.
 */
function linkagent_print_script() {
	if ( is_admin() || is_user_logged_in() && current_user_can( 'edit_posts' ) && is_preview() ) {
		return;
	}
	$key = linkagent_get_key();
	if ( ! $key ) {
		return;
	}
	printf(
		'<script src="%s" data-key="%s" defer></script>' . "\n",
		esc_url( linkagent_get_host() . '/linkagent.js' ),
		esc_attr( $key )
	);
}
add_action( 'wp_footer', 'linkagent_print_script', 99 );

/**
 * Settings page.
 */
function linkagent_register_settings() {
	register_setting(
		'linkagent',
		'linkagent_site_key',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_text_field',
			'default'           => '',
		)
	);
	register_setting(
		'linkagent',
		'linkagent_host',
		array(
			'type'              => 'string',
			'sanitize_callback' => 'esc_url_raw',
			'default'           => '',
		)
	);
}
add_action( 'admin_init', 'linkagent_register_settings' );

function linkagent_add_settings_page() {
	add_options_page(
		__( 'Linkagent', 'linkagent' ),
		__( 'Linkagent', 'linkagent' ),
		'manage_options',
		'linkagent',
		'linkagent_render_settings_page'
	);
}
add_action( 'admin_menu', 'linkagent_add_settings_page' );

function linkagent_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$key       = linkagent_get_key();
	$dashboard = linkagent_get_host();
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Linkagent', 'linkagent' ); ?></h1>
		<p>
			<?php esc_html_e( 'Internal linking on autopilot. Crawl your site in the Linkagent dashboard, approve the links you want, and this plugin serves them on your pages.', 'linkagent' ); ?>
		</p>
		<ol>
			<li><?php echo wp_kses_post( sprintf( __( 'Create a free account and add this site at <a href="%s" target="_blank" rel="noopener">the Linkagent dashboard</a>.', 'linkagent' ), esc_url( $dashboard ) ) ); ?></li>
			<li><?php esc_html_e( 'Copy the site key (starts with pk_) from the Install page.', 'linkagent' ); ?></li>
			<li><?php esc_html_e( 'Paste it below and save.', 'linkagent' ); ?></li>
		</ol>
		<form action="options.php" method="post">
			<?php settings_fields( 'linkagent' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="linkagent_site_key"><?php esc_html_e( 'Site key', 'linkagent' ); ?></label></th>
					<td>
						<input name="linkagent_site_key" id="linkagent_site_key" type="text" class="regular-text code" value="<?php echo esc_attr( $key ); ?>" placeholder="pk_..." />
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="linkagent_host"><?php esc_html_e( 'Server (optional)', 'linkagent' ); ?></label></th>
					<td>
						<input name="linkagent_host" id="linkagent_host" type="url" class="regular-text code" value="<?php echo esc_attr( (string) get_option( 'linkagent_host', '' ) ); ?>" placeholder="<?php echo esc_attr( LINKAGENT_DEFAULT_HOST ); ?>" />
						<p class="description"><?php esc_html_e( 'Only change this if you self-host Linkagent.', 'linkagent' ); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
		<?php if ( $key ) : ?>
			<p><strong><?php esc_html_e( 'Status: active.', 'linkagent' ); ?></strong> <?php esc_html_e( 'The script is being served on your public pages.', 'linkagent' ); ?></p>
		<?php else : ?>
			<p><strong><?php esc_html_e( 'Status: waiting for a site key.', 'linkagent' ); ?></strong></p>
		<?php endif; ?>
	</div>
	<?php
}

/**
 * Settings link on the plugins screen.
 */
function linkagent_plugin_action_links( $links ) {
	$settings = '<a href="' . esc_url( admin_url( 'options-general.php?page=linkagent' ) ) . '">' . esc_html__( 'Settings', 'linkagent' ) . '</a>';
	array_unshift( $links, $settings );
	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'linkagent_plugin_action_links' );
