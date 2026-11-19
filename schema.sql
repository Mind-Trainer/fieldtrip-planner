pragma journal_mode=WAL;
create table if not exists store(key text primary key,value text not null);
create table if not exists verification(id integer primary key,facility text not null,status text not null,evidence text not null,notes text not null,department text not null,time text default current_timestamp);
