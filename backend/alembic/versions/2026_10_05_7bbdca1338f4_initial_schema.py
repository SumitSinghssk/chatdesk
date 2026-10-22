from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '7bbdca1338f4'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('blog_categories',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('parent_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('slug', sa.String(length=180), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('image', sa.String(length=500), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['parent_id'], ['blog_categories.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_blog_categories_deleted_at'), 'blog_categories', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_blog_categories_id'), 'blog_categories', ['id'], unique=False)
    op.create_index(op.f('ix_blog_categories_parent_id'), 'blog_categories', ['parent_id'], unique=False)
    op.create_index(op.f('ix_blog_categories_slug'), 'blog_categories', ['slug'], unique=False)
    op.create_index(op.f('ix_blog_categories_status'), 'blog_categories', ['status'], unique=False)
    op.create_index('uq_blog_categories_slug_live', 'blog_categories', ['slug'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_table('galleries',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('slug', sa.String(length=280), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('event_date', sa.Date(), nullable=True),
    sa.Column('cover_image', sa.String(length=500), nullable=True),
    sa.Column('is_featured', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_galleries_id'), 'galleries', ['id'], unique=False)
    op.create_index(op.f('ix_galleries_slug'), 'galleries', ['slug'], unique=True)
    op.create_index(op.f('ix_galleries_status'), 'galleries', ['status'], unique=False)
    op.create_table('menus',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('key', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('key')
    )
    op.create_table('not_found_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('path', sa.String(length=500), nullable=False),
    sa.Column('hits', sa.Integer(), nullable=False),
    sa.Column('last_referrer', sa.String(length=1000), nullable=True),
    sa.Column('last_user_agent', sa.String(length=500), nullable=True),
    sa.Column('ignored', sa.Boolean(), nullable=False),
    sa.Column('first_seen_at', sa.DateTime(), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_not_found_logs_id'), 'not_found_logs', ['id'], unique=False)
    op.create_index(op.f('ix_not_found_logs_ignored'), 'not_found_logs', ['ignored'], unique=False)
    op.create_index(op.f('ix_not_found_logs_last_seen_at'), 'not_found_logs', ['last_seen_at'], unique=False)
    op.create_index(op.f('ix_not_found_logs_path'), 'not_found_logs', ['path'], unique=True)
    op.create_table('password_reset_tokens',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_password_reset_tokens_email'), 'password_reset_tokens', ['email'], unique=False)
    op.create_table('permissions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('group', sa.String(length=100), nullable=True),
    sa.Column('description', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_permissions_group'), 'permissions', ['group'], unique=False)
    op.create_index(op.f('ix_permissions_id'), 'permissions', ['id'], unique=False)
    op.create_index(op.f('ix_permissions_name'), 'permissions', ['name'], unique=True)
    op.create_table('redirects',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('source_path', sa.String(length=500), nullable=False),
    sa.Column('target_url', sa.String(length=2048), nullable=False),
    sa.Column('status_code', sa.SmallInteger(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('hits', sa.Integer(), nullable=False),
    sa.Column('last_hit_at', sa.DateTime(), nullable=True),
    sa.Column('note', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_redirects_id'), 'redirects', ['id'], unique=False)
    op.create_index(op.f('ix_redirects_source_path'), 'redirects', ['source_path'], unique=True)
    op.create_index(op.f('ix_redirects_status'), 'redirects', ['status'], unique=False)
    op.create_table('roles',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('description', sa.String(length=255), nullable=True),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.Column('requires_two_factor', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_roles_id'), 'roles', ['id'], unique=False)
    op.create_table('seo_pages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('page', sa.String(length=150), nullable=False),
    sa.Column('path', sa.String(length=500), nullable=False),
    sa.Column('meta_title', sa.String(length=255), nullable=True),
    sa.Column('meta_description', sa.String(length=500), nullable=True),
    sa.Column('meta_keywords', sa.String(length=500), nullable=True),
    sa.Column('og_image', sa.String(length=500), nullable=True),
    sa.Column('canonical_url', sa.String(length=1000), nullable=True),
    sa.Column('schema_markup', sa.Text(), nullable=True),
    sa.Column('header_scripts', sa.Text(), nullable=True),
    sa.Column('footer_scripts', sa.Text(), nullable=True),
    sa.Column('custom_css', sa.Text(), nullable=True),
    sa.Column('faqs', sa.JSON(), nullable=True),
    sa.Column('allow_indexing', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_seo_pages_id'), 'seo_pages', ['id'], unique=False)
    op.create_index(op.f('ix_seo_pages_path'), 'seo_pages', ['path'], unique=True)
    op.create_table('settings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('key', sa.String(length=100), nullable=False),
    sa.Column('value', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_settings_key'), 'settings', ['key'], unique=True)
    op.create_table('testimonials',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('designation', sa.String(length=150), nullable=True),
    sa.Column('company', sa.String(length=150), nullable=True),
    sa.Column('quote', sa.Text(), nullable=False),
    sa.Column('photo', sa.String(length=500), nullable=True),
    sa.Column('rating', sa.SmallInteger(), nullable=True),
    sa.Column('is_featured', sa.Boolean(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_testimonials_deleted_at'), 'testimonials', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_testimonials_id'), 'testimonials', ['id'], unique=False)
    op.create_index(op.f('ix_testimonials_status'), 'testimonials', ['status'], unique=False)
    op.create_table('gallery_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('gallery_id', sa.Integer(), nullable=False),
    sa.Column('type', sa.String(length=20), nullable=False),
    sa.Column('path', sa.String(length=500), nullable=True),
    sa.Column('youtube_id', sa.String(length=20), nullable=True),
    sa.Column('title', sa.String(length=255), nullable=True),
    sa.Column('caption', sa.Text(), nullable=True),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['gallery_id'], ['galleries.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_gallery_items_gallery_id'), 'gallery_items', ['gallery_id'], unique=False)
    op.create_table('menu_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('menu_id', sa.Integer(), nullable=False),
    sa.Column('parent_id', sa.Integer(), nullable=True),
    sa.Column('label', sa.String(length=120), nullable=False),
    sa.Column('url', sa.String(length=2000), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('new_tab', sa.Boolean(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['menu_id'], ['menus.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['parent_id'], ['menu_items.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_menu_items_menu_id'), 'menu_items', ['menu_id'], unique=False)
    op.create_index(op.f('ix_menu_items_parent_id'), 'menu_items', ['parent_id'], unique=False)
    op.create_table('role_permissions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('role_id', sa.Integer(), nullable=False),
    sa.Column('permission_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('role_id', 'permission_id', name='uq_role_permissions_role_permission')
    )
    op.create_index('ix_role_permissions_permission_id', 'role_permissions', ['permission_id'], unique=False)
    op.create_index(op.f('ix_role_permissions_role_id'), 'role_permissions', ['role_id'], unique=False)
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('role_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('password', sa.String(length=255), nullable=False),
    sa.Column('avatar', sa.String(length=500), nullable=True),
    sa.Column('bio', sa.Text(), nullable=True),
    sa.Column('social_links', sa.JSON(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('token_version', sa.Integer(), nullable=False),
    sa.Column('two_factor_secret', sa.Text(), nullable=True),
    sa.Column('two_factor_recovery_codes', sa.JSON(), nullable=True),
    sa.Column('two_factor_confirmed_at', sa.DateTime(), nullable=True),
    sa.Column('failed_logins', sa.SmallInteger(), nullable=False),
    sa.Column('locked_until', sa.DateTime(), nullable=True),
    sa.Column('last_login_at', sa.DateTime(), nullable=True),
    sa.Column('last_login_ip', sa.String(length=64), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_deleted_at'), 'users', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_role_id'), 'users', ['role_id'], unique=False)
    op.create_index(op.f('ix_users_status'), 'users', ['status'], unique=False)
    op.create_table('activity_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('user_email', sa.String(length=255), nullable=True),
    sa.Column('action', sa.String(length=50), nullable=False),
    sa.Column('subject_type', sa.String(length=50), nullable=True),
    sa.Column('subject_id', sa.Integer(), nullable=True),
    sa.Column('subject_label', sa.String(length=255), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('old_values', sa.JSON(), nullable=True),
    sa.Column('new_values', sa.JSON(), nullable=True),
    sa.Column('ip_address', sa.String(length=64), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('browser', sa.String(length=100), nullable=True),
    sa.Column('platform', sa.String(length=100), nullable=True),
    sa.Column('device', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_activity_logs_action'), 'activity_logs', ['action'], unique=False)
    op.create_index(op.f('ix_activity_logs_created_at'), 'activity_logs', ['created_at'], unique=False)
    op.create_index('ix_activity_logs_subject', 'activity_logs', ['subject_type', 'subject_id'], unique=False)
    op.create_index(op.f('ix_activity_logs_user_id'), 'activity_logs', ['user_id'], unique=False)
    op.create_table('blogs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=True),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('slug', sa.String(length=280), nullable=False),
    sa.Column('excerpt', sa.String(length=500), nullable=True),
    sa.Column('content', sa.Text(), nullable=True),
    sa.Column('featured_image', sa.String(length=500), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('published_at', sa.DateTime(), nullable=True),
    sa.Column('meta_title', sa.String(length=255), nullable=True),
    sa.Column('meta_description', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_blogs_author_id'), 'blogs', ['author_id'], unique=False)
    op.create_index(op.f('ix_blogs_deleted_at'), 'blogs', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_blogs_id'), 'blogs', ['id'], unique=False)
    op.create_index(op.f('ix_blogs_published_at'), 'blogs', ['published_at'], unique=False)
    op.create_index(op.f('ix_blogs_slug'), 'blogs', ['slug'], unique=False)
    op.create_index(op.f('ix_blogs_status'), 'blogs', ['status'], unique=False)
    op.create_index('uq_blogs_slug_live', 'blogs', ['slug'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_table('enquiries',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('source', sa.String(length=50), nullable=False),
    sa.Column('source_url', sa.String(length=1000), nullable=True),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=True),
    sa.Column('phone', sa.String(length=30), nullable=True),
    sa.Column('company', sa.String(length=150), nullable=True),
    sa.Column('subject', sa.String(length=255), nullable=True),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('assigned_to', sa.Integer(), nullable=True),
    sa.Column('follow_up_at', sa.DateTime(), nullable=True),
    sa.Column('seen_at', sa.DateTime(), nullable=True),
    sa.Column('created_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['assigned_to'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_enquiries_assigned_to'), 'enquiries', ['assigned_to'], unique=False)
    op.create_index(op.f('ix_enquiries_deleted_at'), 'enquiries', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_enquiries_email'), 'enquiries', ['email'], unique=False)
    op.create_index(op.f('ix_enquiries_follow_up_at'), 'enquiries', ['follow_up_at'], unique=False)
    op.create_index(op.f('ix_enquiries_id'), 'enquiries', ['id'], unique=False)
    op.create_index(op.f('ix_enquiries_source'), 'enquiries', ['source'], unique=False)
    op.create_index(op.f('ix_enquiries_status'), 'enquiries', ['status'], unique=False)
    op.create_table('media_files',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('folder', sa.String(length=100), nullable=False),
    sa.Column('filename', sa.String(length=255), nullable=False),
    sa.Column('original_name', sa.String(length=255), nullable=True),
    sa.Column('path', sa.String(length=500), nullable=False),
    sa.Column('url', sa.String(length=500), nullable=False),
    sa.Column('mime', sa.String(length=100), nullable=True),
    sa.Column('extension', sa.String(length=10), nullable=True),
    sa.Column('size', sa.BigInteger(), nullable=False),
    sa.Column('width', sa.Integer(), nullable=True),
    sa.Column('height', sa.Integer(), nullable=True),
    sa.Column('alt', sa.String(length=255), nullable=True),
    sa.Column('uploaded_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('path')
    )
    op.create_index(op.f('ix_media_files_extension'), 'media_files', ['extension'], unique=False)
    op.create_index(op.f('ix_media_files_folder'), 'media_files', ['folder'], unique=False)
    op.create_index(op.f('ix_media_files_id'), 'media_files', ['id'], unique=False)
    op.create_table('notifications',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('type', sa.String(length=50), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('url', sa.String(length=500), nullable=True),
    sa.Column('data', sa.JSON(), nullable=True),
    sa.Column('read_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_created_at'), 'notifications', ['created_at'], unique=False)
    op.create_index(op.f('ix_notifications_read_at'), 'notifications', ['read_at'], unique=False)
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    op.create_table('pages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('author_id', sa.Integer(), nullable=True),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('slug', sa.String(length=280), nullable=False),
    sa.Column('content', sa.Text(), nullable=True),
    sa.Column('featured_image', sa.String(length=500), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('published_at', sa.DateTime(), nullable=True),
    sa.Column('meta_title', sa.String(length=255), nullable=True),
    sa.Column('meta_description', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_pages_author_id'), 'pages', ['author_id'], unique=False)
    op.create_index(op.f('ix_pages_deleted_at'), 'pages', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_pages_id'), 'pages', ['id'], unique=False)
    op.create_index(op.f('ix_pages_slug'), 'pages', ['slug'], unique=False)
    op.create_index(op.f('ix_pages_status'), 'pages', ['status'], unique=False)
    op.create_index('uq_pages_slug_live', 'pages', ['slug'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_table('user_permissions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('permission_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'permission_id', name='uq_user_permissions_user_permission')
    )
    op.create_index('ix_user_permissions_permission_id', 'user_permissions', ['permission_id'], unique=False)
    op.create_index(op.f('ix_user_permissions_user_id'), 'user_permissions', ['user_id'], unique=False)
    op.create_table('user_sessions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('refresh_token_hash', sa.String(length=64), nullable=True),
    sa.Column('ip_address', sa.String(length=64), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('remember', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('last_active_at', sa.DateTime(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('revoked_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_sessions_revoked_at'), 'user_sessions', ['revoked_at'], unique=False)
    op.create_index(op.f('ix_user_sessions_user_id'), 'user_sessions', ['user_id'], unique=False)
    op.create_table('blog_category_blog',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('blog_id', sa.Integer(), nullable=False),
    sa.Column('blog_category_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['blog_category_id'], ['blog_categories.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['blog_id'], ['blogs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('blog_id', 'blog_category_id', name='uq_blog_category_blog_pair')
    )
    op.create_index(op.f('ix_blog_category_blog_blog_category_id'), 'blog_category_blog', ['blog_category_id'], unique=False)
    op.create_index(op.f('ix_blog_category_blog_blog_id'), 'blog_category_blog', ['blog_id'], unique=False)
    op.create_table('enquiry_activities',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('enquiry_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('type', sa.String(length=20), nullable=False),
    sa.Column('body', sa.Text(), nullable=True),
    sa.Column('meta', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['enquiry_id'], ['enquiries.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_enquiry_activities_enquiry_id'), 'enquiry_activities', ['enquiry_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_enquiry_activities_enquiry_id'), table_name='enquiry_activities')
    op.drop_table('enquiry_activities')
    op.drop_index(op.f('ix_blog_category_blog_blog_id'), table_name='blog_category_blog')
    op.drop_index(op.f('ix_blog_category_blog_blog_category_id'), table_name='blog_category_blog')
    op.drop_table('blog_category_blog')
    op.drop_index(op.f('ix_user_sessions_user_id'), table_name='user_sessions')
    op.drop_index(op.f('ix_user_sessions_revoked_at'), table_name='user_sessions')
    op.drop_table('user_sessions')
    op.drop_index(op.f('ix_user_permissions_user_id'), table_name='user_permissions')
    op.drop_index('ix_user_permissions_permission_id', table_name='user_permissions')
    op.drop_table('user_permissions')
    op.drop_index('uq_pages_slug_live', table_name='pages', postgresql_where=sa.text('deleted_at IS NULL'))
    op.drop_index(op.f('ix_pages_status'), table_name='pages')
    op.drop_index(op.f('ix_pages_slug'), table_name='pages')
    op.drop_index(op.f('ix_pages_id'), table_name='pages')
    op.drop_index(op.f('ix_pages_deleted_at'), table_name='pages')
    op.drop_index(op.f('ix_pages_author_id'), table_name='pages')
    op.drop_table('pages')
    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_read_at'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_created_at'), table_name='notifications')
    op.drop_table('notifications')
    op.drop_index(op.f('ix_media_files_id'), table_name='media_files')
    op.drop_index(op.f('ix_media_files_folder'), table_name='media_files')
    op.drop_index(op.f('ix_media_files_extension'), table_name='media_files')
    op.drop_table('media_files')
    op.drop_index(op.f('ix_enquiries_status'), table_name='enquiries')
    op.drop_index(op.f('ix_enquiries_source'), table_name='enquiries')
    op.drop_index(op.f('ix_enquiries_id'), table_name='enquiries')
    op.drop_index(op.f('ix_enquiries_follow_up_at'), table_name='enquiries')
    op.drop_index(op.f('ix_enquiries_email'), table_name='enquiries')
    op.drop_index(op.f('ix_enquiries_deleted_at'), table_name='enquiries')
    op.drop_index(op.f('ix_enquiries_assigned_to'), table_name='enquiries')
    op.drop_table('enquiries')
    op.drop_index('uq_blogs_slug_live', table_name='blogs', postgresql_where=sa.text('deleted_at IS NULL'))
    op.drop_index(op.f('ix_blogs_status'), table_name='blogs')
    op.drop_index(op.f('ix_blogs_slug'), table_name='blogs')
    op.drop_index(op.f('ix_blogs_published_at'), table_name='blogs')
    op.drop_index(op.f('ix_blogs_id'), table_name='blogs')
    op.drop_index(op.f('ix_blogs_deleted_at'), table_name='blogs')
    op.drop_index(op.f('ix_blogs_author_id'), table_name='blogs')
    op.drop_table('blogs')
    op.drop_index(op.f('ix_activity_logs_user_id'), table_name='activity_logs')
    op.drop_index('ix_activity_logs_subject', table_name='activity_logs')
    op.drop_index(op.f('ix_activity_logs_created_at'), table_name='activity_logs')
    op.drop_index(op.f('ix_activity_logs_action'), table_name='activity_logs')
    op.drop_table('activity_logs')
    op.drop_index(op.f('ix_users_status'), table_name='users')
    op.drop_index(op.f('ix_users_role_id'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index(op.f('ix_users_deleted_at'), table_name='users')
    op.drop_table('users')
    op.drop_index(op.f('ix_role_permissions_role_id'), table_name='role_permissions')
    op.drop_index('ix_role_permissions_permission_id', table_name='role_permissions')
    op.drop_table('role_permissions')
    op.drop_index(op.f('ix_menu_items_parent_id'), table_name='menu_items')
    op.drop_index(op.f('ix_menu_items_menu_id'), table_name='menu_items')
    op.drop_table('menu_items')
    op.drop_index(op.f('ix_gallery_items_gallery_id'), table_name='gallery_items')
    op.drop_table('gallery_items')
    op.drop_index(op.f('ix_testimonials_status'), table_name='testimonials')
    op.drop_index(op.f('ix_testimonials_id'), table_name='testimonials')
    op.drop_index(op.f('ix_testimonials_deleted_at'), table_name='testimonials')
    op.drop_table('testimonials')
    op.drop_index(op.f('ix_settings_key'), table_name='settings')
    op.drop_table('settings')
    op.drop_index(op.f('ix_seo_pages_path'), table_name='seo_pages')
    op.drop_index(op.f('ix_seo_pages_id'), table_name='seo_pages')
    op.drop_table('seo_pages')
    op.drop_index(op.f('ix_roles_id'), table_name='roles')
    op.drop_table('roles')
    op.drop_index(op.f('ix_redirects_status'), table_name='redirects')
    op.drop_index(op.f('ix_redirects_source_path'), table_name='redirects')
    op.drop_index(op.f('ix_redirects_id'), table_name='redirects')
    op.drop_table('redirects')
    op.drop_index(op.f('ix_permissions_name'), table_name='permissions')
    op.drop_index(op.f('ix_permissions_id'), table_name='permissions')
    op.drop_index(op.f('ix_permissions_group'), table_name='permissions')
    op.drop_table('permissions')
    op.drop_index(op.f('ix_password_reset_tokens_email'), table_name='password_reset_tokens')
    op.drop_table('password_reset_tokens')
    op.drop_index(op.f('ix_not_found_logs_path'), table_name='not_found_logs')
    op.drop_index(op.f('ix_not_found_logs_last_seen_at'), table_name='not_found_logs')
    op.drop_index(op.f('ix_not_found_logs_ignored'), table_name='not_found_logs')
    op.drop_index(op.f('ix_not_found_logs_id'), table_name='not_found_logs')
    op.drop_table('not_found_logs')
    op.drop_table('menus')
    op.drop_index(op.f('ix_galleries_status'), table_name='galleries')
    op.drop_index(op.f('ix_galleries_slug'), table_name='galleries')
    op.drop_index(op.f('ix_galleries_id'), table_name='galleries')
    op.drop_table('galleries')
    op.drop_index('uq_blog_categories_slug_live', table_name='blog_categories', postgresql_where=sa.text('deleted_at IS NULL'))
    op.drop_index(op.f('ix_blog_categories_status'), table_name='blog_categories')
    op.drop_index(op.f('ix_blog_categories_slug'), table_name='blog_categories')
    op.drop_index(op.f('ix_blog_categories_parent_id'), table_name='blog_categories')
    op.drop_index(op.f('ix_blog_categories_id'), table_name='blog_categories')
    op.drop_index(op.f('ix_blog_categories_deleted_at'), table_name='blog_categories')
    op.drop_table('blog_categories')
