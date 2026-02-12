-- Migration: Create marketplace tables
-- Implements workflow marketplace with listings, publishers, reviews, and installations

-- Create enums for marketplace
CREATE TYPE listing_status AS ENUM (
  'draft',
  'pending_review',
  'published',
  'rejected',
  'archived'
);

CREATE TYPE license_type AS ENUM (
  'mit',
  'apache-2.0',
  'gpl-3.0',
  'proprietary',
  'custom'
);

CREATE TYPE pricing_tier AS ENUM (
  'free',
  'premium',
  'enterprise'
);

-- Publishers table
CREATE TABLE publishers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  website TEXT,
  verified BOOLEAN DEFAULT false,
  listings_count INTEGER DEFAULT 0,
  total_downloads INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_name CHECK (name ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  CONSTRAINT name_length CHECK (length(name) >= 3 AND length(name) <= 50)
);

-- Marketplace categories table
CREATE TABLE marketplace_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES marketplace_categories(id) ON DELETE CASCADE,
  icon TEXT,
  listing_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$')
);

-- Marketplace listings table
CREATE TABLE marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id UUID REFERENCES publishers(id) ON DELETE CASCADE NOT NULL,

  -- Listing metadata
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT NOT NULL,
  category_id UUID REFERENCES marketplace_categories(id),
  tags TEXT[] DEFAULT '{}',

  -- Version and licensing
  version TEXT NOT NULL DEFAULT '1.0.0',
  license license_type NOT NULL DEFAULT 'mit',
  custom_license_text TEXT,

  -- Pricing
  pricing pricing_tier NOT NULL DEFAULT 'free',
  price DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',

  -- Workflow data
  workflow JSONB NOT NULL,

  -- Media
  screenshots TEXT[] DEFAULT '{}',
  icon_url TEXT,

  -- Status and metrics
  status listing_status DEFAULT 'draft',
  downloads INTEGER DEFAULT 0,
  rating DECIMAL(3, 2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,

  -- Full-text search
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(long_description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'D')
  ) STORED,

  CONSTRAINT unique_publisher_slug UNIQUE (publisher_id, slug),
  CONSTRAINT valid_version CHECK (version ~ '^\d+\.\d+\.\d+(-[a-z0-9.]+)?$'),
  CONSTRAINT valid_rating CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT valid_price CHECK (
    (pricing = 'free' AND price IS NULL) OR
    (pricing != 'free' AND price > 0)
  )
);

-- Reviews table
CREATE TABLE marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES marketplace_listings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  helpful INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT false, -- User has installed the workflow

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT one_review_per_user UNIQUE (listing_id, user_id),
  CONSTRAINT title_length CHECK (length(title) >= 3 AND length(title) <= 100),
  CONSTRAINT content_length CHECK (length(content) >= 10)
);

-- Review helpfulness votes
CREATE TABLE review_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES marketplace_reviews(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_helpful BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT one_vote_per_user UNIQUE (review_id, user_id)
);

-- Installations table
CREATE TABLE marketplace_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES marketplace_listings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  version TEXT NOT NULL,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  last_used TIMESTAMPTZ,

  CONSTRAINT unique_user_listing UNIQUE (user_id, listing_id)
);

-- Featured listings table
CREATE TABLE featured_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES marketplace_listings(id) ON DELETE CASCADE NOT NULL UNIQUE,
  featured_reason TEXT NOT NULL,
  featured_score DECIMAL(5, 2) DEFAULT 0,
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date > start_date)
);

-- Listing dependencies table
CREATE TABLE listing_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES marketplace_listings(id) ON DELETE CASCADE NOT NULL,
  required_credentials TEXT[] DEFAULT '{}',
  required_nodes TEXT[] DEFAULT '{}',
  min_n8n_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_listing_deps UNIQUE (listing_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Publishers
CREATE INDEX idx_publishers_user_id ON publishers(user_id);
CREATE INDEX idx_publishers_name ON publishers(name);
CREATE INDEX idx_publishers_verified ON publishers(verified) WHERE verified = true;

-- Categories
CREATE INDEX idx_categories_parent_id ON marketplace_categories(parent_id);
CREATE INDEX idx_categories_slug ON marketplace_categories(slug);

-- Listings
CREATE INDEX idx_listings_publisher_id ON marketplace_listings(publisher_id);
CREATE INDEX idx_listings_category_id ON marketplace_listings(category_id);
CREATE INDEX idx_listings_status ON marketplace_listings(status);
CREATE INDEX idx_listings_pricing ON marketplace_listings(pricing);
CREATE INDEX idx_listings_rating ON marketplace_listings(rating DESC);
CREATE INDEX idx_listings_downloads ON marketplace_listings(downloads DESC);
CREATE INDEX idx_listings_created_at ON marketplace_listings(created_at DESC);
CREATE INDEX idx_listings_published_at ON marketplace_listings(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX idx_listings_tags ON marketplace_listings USING GIN(tags);
CREATE INDEX idx_listings_search_vector ON marketplace_listings USING GIN(search_vector);

-- Reviews
CREATE INDEX idx_reviews_listing_id ON marketplace_reviews(listing_id);
CREATE INDEX idx_reviews_user_id ON marketplace_reviews(user_id);
CREATE INDEX idx_reviews_rating ON marketplace_reviews(rating);
CREATE INDEX idx_reviews_created_at ON marketplace_reviews(created_at DESC);

-- Review votes
CREATE INDEX idx_review_votes_review_id ON review_votes(review_id);
CREATE INDEX idx_review_votes_user_id ON review_votes(user_id);

-- Installations
CREATE INDEX idx_installations_listing_id ON marketplace_installations(listing_id);
CREATE INDEX idx_installations_user_id ON marketplace_installations(user_id);
CREATE INDEX idx_installations_installed_at ON marketplace_installations(installed_at DESC);

-- Featured listings
CREATE INDEX idx_featured_listings_score ON featured_listings(featured_score DESC);
CREATE INDEX idx_featured_active ON featured_listings(start_date, end_date)
  WHERE end_date IS NULL OR end_date > NOW();

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Update listing rating when reviews change
CREATE OR REPLACE FUNCTION update_listing_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketplace_listings
  SET
    rating = (
      SELECT COALESCE(AVG(rating), 0)
      FROM marketplace_reviews
      WHERE listing_id = COALESCE(NEW.listing_id, OLD.listing_id)
    ),
    review_count = (
      SELECT COUNT(*)
      FROM marketplace_reviews
      WHERE listing_id = COALESCE(NEW.listing_id, OLD.listing_id)
    )
  WHERE id = COALESCE(NEW.listing_id, OLD.listing_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reviews_update_rating
  AFTER INSERT OR UPDATE OR DELETE ON marketplace_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_listing_rating();

-- Update review helpful count when votes change
CREATE OR REPLACE FUNCTION update_review_helpful()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketplace_reviews
  SET helpful = (
    SELECT COUNT(*)
    FROM review_votes
    WHERE review_id = COALESCE(NEW.review_id, OLD.review_id)
      AND is_helpful = true
  )
  WHERE id = COALESCE(NEW.review_id, OLD.review_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_votes_update_helpful
  AFTER INSERT OR UPDATE OR DELETE ON review_votes
  FOR EACH ROW
  EXECUTE FUNCTION update_review_helpful();

-- Update publisher stats when listings change
CREATE OR REPLACE FUNCTION update_publisher_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE publishers
  SET
    listings_count = (
      SELECT COUNT(*)
      FROM marketplace_listings
      WHERE publisher_id = COALESCE(NEW.publisher_id, OLD.publisher_id)
        AND status = 'published'
    ),
    total_downloads = (
      SELECT COALESCE(SUM(downloads), 0)
      FROM marketplace_listings
      WHERE publisher_id = COALESCE(NEW.publisher_id, OLD.publisher_id)
    )
  WHERE id = COALESCE(NEW.publisher_id, OLD.publisher_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_update_publisher_stats
  AFTER INSERT OR UPDATE OR DELETE ON marketplace_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_publisher_stats();

-- Increment download count
CREATE OR REPLACE FUNCTION increment_download_count(listing_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE marketplace_listings
  SET downloads = downloads + 1
  WHERE id = listing_uuid;
END;
$$ LANGUAGE plpgsql;

-- Update category listing count
CREATE OR REPLACE FUNCTION update_category_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Decrement old category
  IF OLD.category_id IS NOT NULL THEN
    UPDATE marketplace_categories
    SET listing_count = listing_count - 1
    WHERE id = OLD.category_id;
  END IF;

  -- Increment new category
  IF NEW.category_id IS NOT NULL THEN
    UPDATE marketplace_categories
    SET listing_count = listing_count + 1
    WHERE id = NEW.category_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listings_update_category_count
  AFTER UPDATE OF category_id ON marketplace_listings
  FOR EACH ROW
  WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id)
  EXECUTE FUNCTION update_category_count();

CREATE TRIGGER listings_insert_category_count
  AFTER INSERT ON marketplace_listings
  FOR EACH ROW
  WHEN (NEW.category_id IS NOT NULL)
  EXECUTE FUNCTION update_category_count();

-- Updated at triggers
CREATE TRIGGER publishers_updated_at
  BEFORE UPDATE ON publishers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER listings_updated_at
  BEFORE UPDATE ON marketplace_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON marketplace_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Set verified flag on reviews based on installation
CREATE OR REPLACE FUNCTION set_review_verified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.verified = EXISTS (
    SELECT 1 FROM marketplace_installations
    WHERE user_id = NEW.user_id AND listing_id = NEW.listing_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reviews_set_verified
  BEFORE INSERT OR UPDATE ON marketplace_reviews
  FOR EACH ROW
  EXECUTE FUNCTION set_review_verified();

-- ============================================================================
-- SEARCH FUNCTIONS
-- ============================================================================

-- Full-text search function
CREATE OR REPLACE FUNCTION search_listings(
  search_query TEXT,
  category_filter UUID DEFAULT NULL,
  pricing_filter pricing_tier[] DEFAULT NULL,
  min_rating_filter DECIMAL DEFAULT 0,
  tag_filter TEXT[] DEFAULT NULL,
  limit_count INTEGER DEFAULT 20,
  offset_count INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  rating DECIMAL,
  downloads INTEGER,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.name,
    l.description,
    l.rating,
    l.downloads,
    ts_rank(l.search_vector, websearch_to_tsquery('english', search_query)) AS rank
  FROM marketplace_listings l
  WHERE
    l.status = 'published'
    AND (search_query IS NULL OR l.search_vector @@ websearch_to_tsquery('english', search_query))
    AND (category_filter IS NULL OR l.category_id = category_filter)
    AND (pricing_filter IS NULL OR l.pricing = ANY(pricing_filter))
    AND l.rating >= min_rating_filter
    AND (tag_filter IS NULL OR l.tags && tag_filter)
  ORDER BY rank DESC, l.downloads DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$ LANGUAGE plpgsql;

-- Trending listings (last 30 days)
CREATE OR REPLACE FUNCTION get_trending_listings(limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  name TEXT,
  recent_downloads BIGINT,
  download_growth DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH recent_installs AS (
    SELECT
      listing_id,
      COUNT(*) as recent_count
    FROM marketplace_installations
    WHERE installed_at > NOW() - INTERVAL '30 days'
    GROUP BY listing_id
  )
  SELECT
    l.id,
    l.name,
    COALESCE(ri.recent_count, 0) as recent_downloads,
    CASE
      WHEN l.downloads = 0 THEN 0
      ELSE (COALESCE(ri.recent_count, 0)::DECIMAL / l.downloads * 100)
    END as download_growth
  FROM marketplace_listings l
  LEFT JOIN recent_installs ri ON l.id = ri.listing_id
  WHERE l.status = 'published'
  ORDER BY recent_downloads DESC, download_growth DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE publishers IS 'Workflow marketplace publishers';
COMMENT ON TABLE marketplace_categories IS 'Hierarchical workflow categories';
COMMENT ON TABLE marketplace_listings IS 'Marketplace workflow listings with full-text search';
COMMENT ON TABLE marketplace_reviews IS 'User reviews and ratings for listings';
COMMENT ON TABLE review_votes IS 'Helpful votes on reviews';
COMMENT ON TABLE marketplace_installations IS 'Tracks workflow installations';
COMMENT ON TABLE featured_listings IS 'Editorial featured listings';
COMMENT ON TABLE listing_dependencies IS 'Required credentials and nodes for listings';
