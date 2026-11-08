-- Giai doan 3 - P2: tai khoan bot he thong. Chay 1 lan tren DB lw-users. Idempotent.
-- Mat khau ngau nhien, khong ai dang nhap duoc.
create extension if not exists pgcrypto;

insert into users (username, password, name)
values ('sgu_bot', crypt(gen_random_uuid()::text, gen_salt('bf', 10)), 'Tro ly SGU')
on conflict (username) do nothing;

select id, username from users where username = 'sgu_bot';