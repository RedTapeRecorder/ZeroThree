-- Rename table from routes_outlets to route_outlets (if needed)
DO $$
BEGIN
   IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'routes_outlets') THEN
      EXECUTE 'ALTER TABLE public.routes_outlets RENAME TO route_outlets';
   END IF;
END $$;

-- Ensure the table exists with correct columns
CREATE TABLE IF NOT EXISTS route_outlets (
    id SERIAL PRIMARY KEY,
    route_id INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    outlet_id INTEGER NOT NULL REFERENCES outlets_main(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL,
    is_high_priority BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (route_id, outlet_id),
    UNIQUE (route_id, sequence_number)
);

-- If the table already existed but with different column names, adjust them:
DO $$
BEGIN
   IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'route_outlets' AND column_name = 'sequence_order') THEN
      EXECUTE 'ALTER TABLE route_outlets RENAME COLUMN sequence_order TO sequence_number';
   END IF;
   -- Ensure is_high_priority exists with correct type and default
   IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'route_outlets' AND column_name = 'is_high_priority') THEN
      ALTER TABLE route_outlets ADD COLUMN is_high_priority BOOLEAN NOT NULL DEFAULT FALSE;
   END IF;
   -- Ensure foreign keys exist (if not already)
   IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'route_outlets_route_id_fkey' AND table_name = 'route_outlets') THEN
      ALTER TABLE route_outlets ADD CONSTRAINT route_outlets_route_id_fkey FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE;
   END IF;
   IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'route_outlets_outlet_id_fkey' AND table_name = 'route_outlets') THEN
      ALTER TABLE route_outlets ADD CONSTRAINT route_outlets_outlet_id_fkey FOREIGN KEY (outlet_id) REFERENCES outlets_main(id) ON DELETE CASCADE;
   END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_route_outlets_route_id ON route_outlets (route_id);
CREATE INDEX IF NOT EXISTS idx_route_outlets_outlet_id ON route_outlets (outlet_id);