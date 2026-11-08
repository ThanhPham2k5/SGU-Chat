-- Giai doan 3 - P1: vai tro, quyen, phạm vi
-- Chay 1 lan tren DB lw-users (dung chung auth-service va user-service). Idempotent.

insert into roles (name) values ('ROLE_LECTURER'), ('ROLE_STUDENT'), ('ROLE_ROOT')
on conflict (name) do nothing;

create table if not exists permissions (
    id          serial primary key,
    code        varchar(64) not null unique,
    description varchar(255)
);

create table if not exists role_permissions (
    role_id       integer not null references roles (id) on delete cascade,
    permission_id integer not null references permissions (id) on delete cascade,
    primary key (role_id, permission_id)
);

create table if not exists scoped_roles (
    id          bigserial primary key,
    user_id     bigint      not null references users (id) on delete cascade,
    role_id     integer     not null references roles (id) on delete cascade,
    scope_type  varchar(16) not null check (scope_type in ('SCHOOL', 'FACULTY', 'CLASS')),
    scope_id    bigint,
    granted_by  bigint      not null,
    granted_at  timestamptz not null default now(),
    revoked_at  timestamptz,
    check ((scope_type = 'SCHOOL' and scope_id is null) or (scope_type <> 'SCHOOL' and scope_id is not null))
);

create index if not exists idx_scoped_roles_user on scoped_roles (user_id) where revoked_at is null;

insert into permissions (code, description) values
    ('user.view',          'Xem thông tin tài khoản trong phạm vi'),
    ('user.lock',          'Khóa/mở khóa tài khoản trong phạm vi'),
    ('user.role.assign',   'Gán/thu hồi vai trò'),
    ('group.view',         'Xem nhóm trong phạm vi'),
    ('group.manage',       'Quản lý nhóm trong phạm vi'),
    ('announce.send',      'Gửi thông báo cho nhóm/lớp trong phạm vi'),
    ('moderation.view',    'Xem tin nhắn bị báo cáo'),
    ('moderation.resolve', 'Xử lý báo cáo'),
    ('audit.view',         'Xem nhật ký hệ thống'),
    ('import.run',         'Chạy import Excel/CSV')
on conflict (code) do nothing;

-- Gán quyền cho vai trò
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r, permissions p
where (r.name = 'ROLE_ROOT')
   or (r.name = 'ROLE_ADMIN' and p.code in ('user.view','user.lock','group.view','group.manage','announce.send','moderation.view','moderation.resolve','audit.view','import.run'))
   or (r.name = 'ROLE_LECTURER' and p.code in ('group.view','group.manage','announce.send'))
on conflict do nothing;