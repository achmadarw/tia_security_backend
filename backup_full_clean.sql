--
-- PostgreSQL database dump
--

-- Dumped from database version 16.3
-- Dumped by pg_dump version 16.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: update_anomaly_log_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_anomaly_log_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_anomaly_log_updated_at() OWNER TO postgres;

--
-- Name: update_pending_attendance_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_pending_attendance_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_pending_attendance_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    user_id integer,
    shift_id integer,
    type character varying(20) NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now(),
    location_lat numeric(10,8),
    location_lng numeric(11,8),
    face_confidence numeric(5,2),
    photo_url character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    shift_assignment_id integer,
    is_late boolean DEFAULT false,
    is_early_leave boolean DEFAULT false,
    is_overtime boolean DEFAULT false,
    late_minutes integer DEFAULT 0,
    overtime_minutes integer DEFAULT 0,
    face_verified boolean DEFAULT false,
    security_level character varying(10),
    verification_attempts integer DEFAULT 1
);


ALTER TABLE public.attendance OWNER TO postgres;

--
-- Name: COLUMN attendance.face_confidence; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.attendance.face_confidence IS 'Face recognition confidence percentage (0-100)';


--
-- Name: COLUMN attendance.face_verified; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.attendance.face_verified IS 'Whether attendance was verified with face recognition';


--
-- Name: COLUMN attendance.security_level; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.attendance.security_level IS 'Security level applied: LOW, MEDIUM, HIGH';


--
-- Name: COLUMN attendance.verification_attempts; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.attendance.verification_attempts IS 'Number of verification attempts made';


--
-- Name: attendance_anomaly_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_anomaly_log (
    id integer NOT NULL,
    user_id integer,
    attendance_id integer,
    pending_attendance_id integer,
    anomaly_type character varying(50) NOT NULL,
    severity character varying(20) NOT NULL,
    description text NOT NULL,
    anomaly_score numeric(5,2),
    context_data jsonb,
    status character varying(20) DEFAULT 'open'::character varying,
    resolved_by integer,
    resolved_at timestamp without time zone,
    resolution_notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT attendance_anomaly_log_anomaly_type_check CHECK (((anomaly_type)::text = ANY ((ARRAY['location_anomaly'::character varying, 'time_anomaly'::character varying, 'frequency_anomaly'::character varying, 'pattern_anomaly'::character varying, 'distance_anomaly'::character varying, 'confidence_low'::character varying])::text[]))),
    CONSTRAINT attendance_anomaly_log_severity_check CHECK (((severity)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT attendance_anomaly_log_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'investigating'::character varying, 'resolved'::character varying, 'false_positive'::character varying])::text[])))
);


ALTER TABLE public.attendance_anomaly_log OWNER TO postgres;

--
-- Name: attendance_anomaly_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_anomaly_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attendance_anomaly_log_id_seq OWNER TO postgres;

--
-- Name: attendance_anomaly_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_anomaly_log_id_seq OWNED BY public.attendance_anomaly_log.id;


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attendance_id_seq OWNER TO postgres;

--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: attendance_verification_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_verification_log (
    id integer NOT NULL,
    user_id integer NOT NULL,
    attendance_id integer,
    success boolean NOT NULL,
    confidence numeric(5,2),
    margin numeric(5,2),
    reason character varying(100),
    requires_reverification boolean DEFAULT false,
    ip_address character varying(45),
    device_id character varying(255),
    user_agent text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.attendance_verification_log OWNER TO postgres;

--
-- Name: TABLE attendance_verification_log; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.attendance_verification_log IS 'Audit log for all attendance face verification attempts';


--
-- Name: attendance_verification_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.attendance_verification_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.attendance_verification_log_id_seq OWNER TO postgres;

--
-- Name: attendance_verification_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.attendance_verification_log_id_seq OWNED BY public.attendance_verification_log.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer,
    action character varying(100),
    entity_type character varying(50),
    entity_id integer,
    details json,
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_logs_id_seq OWNER TO postgres;

--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: blocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.blocks (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    location_lat numeric(10,8),
    location_lng numeric(11,8),
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.blocks OWNER TO postgres;

--
-- Name: blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.blocks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.blocks_id_seq OWNER TO postgres;

--
-- Name: blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.blocks_id_seq OWNED BY public.blocks.id;


--
-- Name: embedding_quality_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.embedding_quality_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    embedding_id integer NOT NULL,
    quality_score numeric(5,2) NOT NULL,
    consistency_score numeric(5,2),
    distinctiveness_score numeric(5,2),
    calculation_method character varying(50),
    calculated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.embedding_quality_history OWNER TO postgres;

--
-- Name: TABLE embedding_quality_history; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.embedding_quality_history IS 'Historical record of quality score calculations for analysis and improvement';


--
-- Name: COLUMN embedding_quality_history.calculation_method; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.embedding_quality_history.calculation_method IS 'Method used for scoring (e.g., euclidean_v1, cosine_v1)';


--
-- Name: embedding_quality_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.embedding_quality_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.embedding_quality_history_id_seq OWNER TO postgres;

--
-- Name: embedding_quality_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.embedding_quality_history_id_seq OWNED BY public.embedding_quality_history.id;


--
-- Name: face_login_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.face_login_logs (
    id integer NOT NULL,
    user_id integer,
    success boolean DEFAULT false NOT NULL,
    confidence numeric(5,2),
    distance numeric(10,6),
    ip_address character varying(45),
    device_id character varying(255),
    user_agent text,
    error_message text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.face_login_logs OWNER TO postgres;

--
-- Name: face_login_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.face_login_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.face_login_logs_id_seq OWNER TO postgres;

--
-- Name: face_login_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.face_login_logs_id_seq OWNED BY public.face_login_logs.id;


--
-- Name: patterns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.patterns (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    pattern_data integer[] NOT NULL,
    is_active boolean DEFAULT true,
    created_by integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    usage_count integer DEFAULT 0,
    last_used_at timestamp without time zone,
    CONSTRAINT pattern_data_values CHECK (((pattern_data[1] >= 0) AND (pattern_data[2] >= 0) AND (pattern_data[3] >= 0) AND (pattern_data[4] >= 0) AND (pattern_data[5] >= 0) AND (pattern_data[6] >= 0) AND (pattern_data[7] >= 0))),
    CONSTRAINT patterns_pattern_data_check CHECK ((array_length(pattern_data, 1) = 7))
);


ALTER TABLE public.patterns OWNER TO postgres;

--
-- Name: TABLE patterns; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.patterns IS 'Pattern library: single 7-day shift patterns (independent of personil count)';


--
-- Name: COLUMN patterns.pattern_data; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.patterns.pattern_data IS '7-day array: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]. Values: 0=OFF, 1=Pagi, 2=Siang, 3=Sore';


--
-- Name: CONSTRAINT pattern_data_values ON patterns; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON CONSTRAINT pattern_data_values ON public.patterns IS 'Pattern data values: 0 = OFF, >0 = shift ID from shifts table';


--
-- Name: patterns_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.patterns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.patterns_id_seq OWNER TO postgres;

--
-- Name: patterns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.patterns_id_seq OWNED BY public.patterns.id;


--
-- Name: pending_attendance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pending_attendance (
    id integer NOT NULL,
    user_id integer,
    check_time timestamp without time zone NOT NULL,
    check_type character varying(20) NOT NULL,
    location_name character varying(255),
    latitude numeric(10,8),
    longitude numeric(11,8),
    notes text,
    photo text,
    confidence_score numeric(5,2),
    matched_embeddings jsonb,
    security_level character varying(20),
    reason character varying(100) NOT NULL,
    reason_details text,
    status character varying(20) DEFAULT 'pending'::character varying,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    review_notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT pending_attendance_check_type_check CHECK (((check_type)::text = ANY ((ARRAY['check_in'::character varying, 'check_out'::character varying])::text[]))),
    CONSTRAINT pending_attendance_reason_check CHECK (((reason)::text = ANY ((ARRAY['low_confidence'::character varying, 'multiple_matches'::character varying, 'anomaly_detected'::character varying, 'manual_request'::character varying, 'quality_poor'::character varying])::text[]))),
    CONSTRAINT pending_attendance_security_level_check CHECK (((security_level)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying])::text[]))),
    CONSTRAINT pending_attendance_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


ALTER TABLE public.pending_attendance OWNER TO postgres;

--
-- Name: pending_attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pending_attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pending_attendance_id_seq OWNER TO postgres;

--
-- Name: pending_attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pending_attendance_id_seq OWNED BY public.pending_attendance.id;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reports (
    id integer NOT NULL,
    user_id integer,
    block_id integer,
    shift_id integer,
    type character varying(50) NOT NULL,
    title character varying(200),
    description text,
    photo_url character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    location_lat numeric(10,8),
    location_lng numeric(11,8),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.reports OWNER TO postgres;

--
-- Name: reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reports_id_seq OWNER TO postgres;

--
-- Name: reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reports_id_seq OWNED BY public.reports.id;


--
-- Name: roster_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roster_assignments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    pattern_id integer NOT NULL,
    assignment_month date NOT NULL,
    assigned_by integer,
    assigned_at timestamp without time zone DEFAULT now(),
    notes text
);


ALTER TABLE public.roster_assignments OWNER TO postgres;

--
-- Name: TABLE roster_assignments; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.roster_assignments IS 'Monthly assignments: which personil uses which pattern for a given month';


--
-- Name: COLUMN roster_assignments.assignment_month; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.roster_assignments.assignment_month IS 'First day of month (YYYY-MM-01) when this pattern assignment is active';


--
-- Name: roster_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.roster_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.roster_assignments_id_seq OWNER TO postgres;

--
-- Name: roster_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.roster_assignments_id_seq OWNED BY public.roster_assignments.id;


--
-- Name: shift_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shift_assignments (
    id integer NOT NULL,
    user_id integer NOT NULL,
    shift_id integer NOT NULL,
    assignment_date date NOT NULL,
    is_replacement boolean DEFAULT false,
    replaced_user_id integer,
    notes text,
    created_by integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.shift_assignments OWNER TO postgres;

--
-- Name: shift_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shift_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.shift_assignments_id_seq OWNER TO postgres;

--
-- Name: shift_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shift_assignments_id_seq OWNED BY public.shift_assignments.id;


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shifts (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    description text,
    is_active boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    color character varying(50) DEFAULT '#2196F3'::character varying,
    code character varying(3) NOT NULL
);


ALTER TABLE public.shifts OWNER TO postgres;

--
-- Name: COLUMN shifts.color; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.shifts.color IS 'Shift color in any CSS format: hex (#RRGGBB), hsl(h, s%, l%), rgb(r, g, b), etc';


--
-- Name: shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shifts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.shifts_id_seq OWNER TO postgres;

--
-- Name: shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shifts_id_seq OWNED BY public.shifts.id;


--
-- Name: user_embeddings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_embeddings (
    id integer NOT NULL,
    user_id integer NOT NULL,
    embedding jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    quality_score numeric(5,2) DEFAULT NULL::numeric,
    consistency_score numeric(5,2) DEFAULT NULL::numeric,
    distinctiveness_score numeric(5,2) DEFAULT NULL::numeric,
    is_active boolean DEFAULT true,
    image_url text
);


ALTER TABLE public.user_embeddings OWNER TO postgres;

--
-- Name: TABLE user_embeddings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.user_embeddings IS 'Stores face embeddings for face recognition (192D vectors)';


--
-- Name: COLUMN user_embeddings.embedding; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.user_embeddings.embedding IS 'Face embedding as JSON array of 192 floats';


--
-- Name: COLUMN user_embeddings.quality_score; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.user_embeddings.quality_score IS 'Overall quality score (0-100): combination of consistency and distinctiveness';


--
-- Name: COLUMN user_embeddings.consistency_score; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.user_embeddings.consistency_score IS 'Intra-class consistency (0-100): how similar to user''s other embeddings';


--
-- Name: COLUMN user_embeddings.distinctiveness_score; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.user_embeddings.distinctiveness_score IS 'Inter-class separation (0-100): how different from other users'' embeddings';


--
-- Name: COLUMN user_embeddings.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.user_embeddings.is_active IS 'Whether embedding is active for face matching (low quality can be deactivated)';


--
-- Name: COLUMN user_embeddings.image_url; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.user_embeddings.image_url IS 'URL path to the face image file for display purposes';


--
-- Name: user_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_embeddings_id_seq OWNER TO postgres;

--
-- Name: user_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_embeddings_id_seq OWNED BY public.user_embeddings.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(100),
    phone character varying(20) NOT NULL,
    password character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'security'::character varying,
    shift_id integer,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: v_roster_assignments; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.v_roster_assignments AS
 SELECT ra.id,
    ra.assignment_month,
    u.id AS user_id,
    u.name AS user_name,
    u.phone AS user_phone,
    u.role AS user_role,
    p.id AS pattern_id,
    p.name AS pattern_name,
    p.pattern_data,
    ra.notes,
    ra.assigned_at
   FROM ((public.roster_assignments ra
     JOIN public.users u ON ((ra.user_id = u.id)))
     JOIN public.patterns p ON ((ra.pattern_id = p.id)))
  WHERE (((u.status)::text = 'active'::text) AND (p.is_active = true))
  ORDER BY ra.assignment_month DESC, u.name;


ALTER VIEW public.v_roster_assignments OWNER TO postgres;

--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: attendance_anomaly_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_anomaly_log ALTER COLUMN id SET DEFAULT nextval('public.attendance_anomaly_log_id_seq'::regclass);


--
-- Name: attendance_verification_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_verification_log ALTER COLUMN id SET DEFAULT nextval('public.attendance_verification_log_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: blocks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks ALTER COLUMN id SET DEFAULT nextval('public.blocks_id_seq'::regclass);


--
-- Name: embedding_quality_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.embedding_quality_history ALTER COLUMN id SET DEFAULT nextval('public.embedding_quality_history_id_seq'::regclass);


--
-- Name: face_login_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_login_logs ALTER COLUMN id SET DEFAULT nextval('public.face_login_logs_id_seq'::regclass);


--
-- Name: patterns id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patterns ALTER COLUMN id SET DEFAULT nextval('public.patterns_id_seq'::regclass);


--
-- Name: pending_attendance id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_attendance ALTER COLUMN id SET DEFAULT nextval('public.pending_attendance_id_seq'::regclass);


--
-- Name: reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports ALTER COLUMN id SET DEFAULT nextval('public.reports_id_seq'::regclass);


--
-- Name: roster_assignments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_assignments ALTER COLUMN id SET DEFAULT nextval('public.roster_assignments_id_seq'::regclass);


--
-- Name: shift_assignments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_assignments ALTER COLUMN id SET DEFAULT nextval('public.shift_assignments_id_seq'::regclass);


--
-- Name: shifts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts ALTER COLUMN id SET DEFAULT nextval('public.shifts_id_seq'::regclass);


--
-- Name: user_embeddings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_embeddings ALTER COLUMN id SET DEFAULT nextval('public.user_embeddings_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance (id, user_id, shift_id, type, "timestamp", location_lat, location_lng, face_confidence, photo_url, created_at, shift_assignment_id, is_late, is_early_leave, is_overtime, late_minutes, overtime_minutes, face_verified, security_level, verification_attempts) FROM stdin;
60	13	\N	check_in	2026-01-07 23:24:27.582856	-6.51324330	106.80260000	77.87	\N	2026-01-07 23:24:27.582856	1661	t	f	f	24	0	t	LOW	1
61	12	\N	check_in	2026-01-07 23:25:45.910227	-6.51323560	106.80262680	81.69	\N	2026-01-07 23:25:45.910227	1741	t	f	f	25	0	t	LOW	1
62	14	\N	check_in	2026-01-07 23:27:07.618369	-6.51325140	106.80261530	81.96	\N	2026-01-07 23:27:07.618369	1688	t	f	f	507	0	t	LOW	1
63	14	\N	check_out	2026-01-08 00:19:01.827618	-6.51328250	106.80260590	89.54	\N	2026-01-08 00:19:01.827618	\N	f	f	f	0	0	t	LOW	1
\.


--
-- Data for Name: attendance_anomaly_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance_anomaly_log (id, user_id, attendance_id, pending_attendance_id, anomaly_type, severity, description, anomaly_score, context_data, status, resolved_by, resolved_at, resolution_notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: attendance_verification_log; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.attendance_verification_log (id, user_id, attendance_id, success, confidence, margin, reason, requires_reverification, ip_address, device_id, user_agent, created_at) FROM stdin;
57	13	60	t	77.87	\N	SUCCESS	f	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	2026-01-07 23:24:27.582856
58	12	61	t	81.69	\N	SUCCESS	f	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	2026-01-07 23:25:45.910227
59	14	62	t	81.96	\N	SUCCESS	f	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	2026-01-07 23:27:07.618369
60	14	63	t	89.54	\N	SUCCESS	f	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	2026-01-08 00:19:01.827618
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at) FROM stdin;
\.


--
-- Data for Name: blocks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.blocks (id, name, description, location_lat, location_lng, status, created_at) FROM stdin;
1	Blok A	Blok A - Area Depan	\N	\N	active	2025-12-21 00:13:43.513594
2	Blok B	Blok B - Area Tengah	\N	\N	active	2025-12-21 00:13:43.513594
3	Blok C	Blok C - Area Belakang	\N	\N	active	2025-12-21 00:13:43.513594
4	Blok D	Blok D - Area Samping Kiri	\N	\N	active	2025-12-21 00:13:43.513594
5	Blok E	Blok E - Area Samping Kanan	\N	\N	active	2025-12-21 00:13:43.513594
6	Blok A	Blok A - Area Depan	\N	\N	active	2025-12-28 19:16:46.52947
7	Blok B	Blok B - Area Tengah	\N	\N	active	2025-12-28 19:16:46.52947
8	Blok C	Blok C - Area Belakang	\N	\N	active	2025-12-28 19:16:46.52947
9	Blok D	Blok D - Area Samping Kiri	\N	\N	active	2025-12-28 19:16:46.52947
10	Blok E	Blok E - Area Samping Kanan	\N	\N	active	2025-12-28 19:16:46.52947
16	Blok A	Blok A - Area Depan	\N	\N	active	2025-12-28 19:19:42.559244
17	Blok B	Blok B - Area Tengah	\N	\N	active	2025-12-28 19:19:42.559244
18	Blok C	Blok C - Area Belakang	\N	\N	active	2025-12-28 19:19:42.559244
19	Blok D	Blok D - Area Samping Kiri	\N	\N	active	2025-12-28 19:19:42.559244
20	Blok E	Blok E - Area Samping Kanan	\N	\N	active	2025-12-28 19:19:42.559244
\.


--
-- Data for Name: embedding_quality_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.embedding_quality_history (id, user_id, embedding_id, quality_score, consistency_score, distinctiveness_score, calculation_method, calculated_at) FROM stdin;
1	12	11	63.05	54.11	76.46	euclidean_v1	2026-01-04 00:10:05.584296
2	12	10	63.91	51.26	82.88	euclidean_v1	2026-01-04 00:10:05.584296
3	12	9	51.32	43.67	62.79	euclidean_v1	2026-01-04 00:10:05.584296
4	12	8	46.23	36.65	60.61	euclidean_v1	2026-01-04 00:10:05.584296
5	12	7	62.45	37.57	99.78	euclidean_v1	2026-01-04 00:10:05.584296
6	12	6	61.23	47.62	81.64	euclidean_v1	2026-01-04 00:10:05.584296
7	12	5	62.62	49.90	81.69	euclidean_v1	2026-01-04 00:10:05.584296
\.


--
-- Data for Name: face_login_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.face_login_logs (id, user_id, success, confidence, distance, ip_address, device_id, user_agent, error_message, created_at) FROM stdin;
42	13	t	46.97	0.530300	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 20:15:06.669815
43	12	t	50.26	0.497404	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 20:53:55.203815
44	13	t	55.03	0.449717	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 20:54:51.992507
45	12	t	44.64	0.553557	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 21:06:07.776105
46	\N	f	\N	\N	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	System error: attendance is not defined	2026-01-02 21:06:07.785641
47	12	t	46.20	0.537954	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 21:06:16.168947
48	\N	f	\N	\N	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	System error: attendance is not defined	2026-01-02 21:06:16.173565
49	\N	f	\N	0.670022	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Face not recognized	2026-01-02 21:09:44.91855
50	13	t	63.44	0.365613	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 21:10:08.797756
51	12	t	42.71	0.572902	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 21:10:25.467867
52	13	t	63.73	0.362688	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 21:11:12.548155
53	13	t	51.07	0.489300	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 21:18:44.441665
54	13	t	40.56	0.594377	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 21:24:13.582638
55	12	t	50.82	0.491826	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 21:37:38.330753
56	13	t	43.60	0.563957	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 21:41:28.998262
57	12	t	49.60	0.503957	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-02 21:41:55.471162
58	\N	f	\N	0.514145	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Face not recognized	2026-01-02 21:50:41.03093
59	\N	f	\N	0.529660	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Face not recognized	2026-01-02 21:50:54.118785
60	\N	f	\N	0.530727	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Face not recognized	2026-01-02 21:51:06.495966
61	13	f	52.18	0.478197	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Confidence too low: 52.18%	2026-01-02 21:58:18.481289
62	13	f	55.48	0.445182	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Match too ambiguous: margin 0.0565, confidence 55.48%	2026-01-02 21:58:35.536631
63	\N	f	\N	0.578184	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Face not recognized	2026-01-02 21:58:53.896495
64	12	f	47.29	0.527113	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Match too ambiguous: margin 0.0148, confidence 47.29%	2026-01-03 00:03:17.653405
65	13	t	68.66	0.313360	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-03 00:03:44.565582
66	13	t	55.41	0.445875	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-03 00:03:59.101319
67	13	f	45.19	0.548082	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Match too ambiguous: margin 0.0445, confidence 45.19%	2026-01-03 00:04:13.313018
68	13	t	61.13	0.388714	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-03 00:11:54.500486
69	13	t	63.57	0.364307	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-03 00:12:07.725256
70	13	f	49.03	0.509743	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Match too ambiguous: margin 0.0217, confidence 49.03%	2026-01-03 00:12:17.457777
71	13	f	48.73	0.512737	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	Match too ambiguous: margin 0.0149, confidence 48.73%	2026-01-03 00:12:26.308303
72	13	t	46.67	0.533266	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-03 00:12:33.465915
73	13	t	49.64	0.503639	::ffff:192.168.0.129	\N	Dart/3.4 (dart:io)	\N	2026-01-03 00:13:00.052262
74	12	t	45.83	0.541749	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-03 22:59:33.252025
75	12	f	37.54	0.624630	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	Confidence too low: 37.54%	2026-01-03 23:02:05.054781
76	12	f	35.67	0.643325	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	Confidence too low: 35.67%	2026-01-03 23:02:13.613971
77	8	t	55.54	0.444604	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-03 23:02:19.212149
78	12	t	40.62	0.593828	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-03 23:12:54.992798
79	12	t	41.12	0.588836	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-03 23:14:17.826845
80	12	t	50.05	0.499538	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-03 23:14:33.190679
81	8	t	54.72	0.452798	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-03 23:18:54.668048
82	8	t	91.15	0.088482	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-03 23:22:00.803126
83	8	t	94.16	0.058425	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-03 23:22:11.15653
84	8	t	84.28	0.157171	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 01:50:44.771166
85	8	t	88.23	0.117726	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 01:50:56.055872
86	8	t	91.71	0.082924	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 01:56:10.431667
87	8	t	83.66	0.163427	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 11:32:00.714167
88	8	t	91.47	0.085263	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 15:09:11.694137
89	13	t	88.74	0.112572	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 15:42:49.073899
90	13	f	57.05	0.429527	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	Match too ambiguous: margin 0.0026, confidence 57.05%	2026-01-04 15:43:09.995599
91	13	t	57.71	0.422907	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 15:43:22.423251
92	13	t	87.83	0.121732	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 15:46:42.14947
93	13	t	63.95	0.360453	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 15:47:48.554955
94	13	f	64.47	0.355258	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	Match too ambiguous: margin 0.0374, confidence 64.47%	2026-01-04 15:51:00.188138
95	13	t	54.34	0.456554	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 15:51:10.54963
96	13	t	91.33	0.086698	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 15:58:26.477506
97	13	t	79.37	0.206291	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 18:11:39.22403
98	13	t	80.60	0.194030	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 18:13:49.754038
99	13	t	87.08	0.129230	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 18:19:52.716568
100	13	t	90.96	0.090402	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 18:22:43.612193
101	13	t	87.44	0.125588	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 19:44:21.483644
102	13	t	77.08	0.229199	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 19:51:08.945415
103	13	t	88.33	0.116749	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 19:52:41.672087
104	13	t	88.13	0.118709	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 19:53:14.132839
105	13	t	81.14	0.188645	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 20:02:09.723262
106	13	t	88.54	0.114571	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 20:08:35.506663
107	13	t	87.63	0.123651	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 20:18:12.8048
108	13	t	88.31	0.116904	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 20:34:31.106469
109	13	t	88.69	0.113092	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 20:44:33.234022
110	13	t	91.59	0.084080	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 20:54:59.324475
111	13	t	90.12	0.098754	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 21:03:35.272388
112	13	t	87.43	0.125729	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 21:20:33.742906
113	13	t	87.50	0.125029	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 21:22:29.429248
114	13	t	86.11	0.138877	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-04 22:57:39.795395
115	14	t	86.61	0.133927	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-05 00:56:59.359869
116	14	t	86.43	0.135734	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-05 02:01:35.158972
117	11	t	91.11	0.088941	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-06 22:25:43.601244
118	11	t	87.23	0.127712	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-07 00:26:50.576479
119	14	t	93.28	0.067242	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-07 00:52:24.476168
120	13	t	87.94	0.120569	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-07 23:24:14.417032
121	12	t	85.38	0.146168	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-07 23:25:38.392364
122	14	t	70.83	0.291677	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-07 23:26:57.085177
123	14	t	80.71	0.192873	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-08 00:34:34.886885
124	13	t	87.36	0.126436	::ffff:192.168.18.3	\N	Dart/3.4 (dart:io)	\N	2026-01-08 01:00:37.893483
\.


--
-- Data for Name: patterns; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.patterns (id, name, description, pattern_data, is_active, created_by, created_at, updated_at, usage_count, last_used_at) FROM stdin;
9	0133221		{0,20,22,22,21,21,20}	t	1	2025-12-30 01:05:53.36015	2025-12-30 01:36:19.255752	2	2025-12-30 23:30:24.712484
11	1332320		{20,22,22,21,22,21,0}	t	1	2025-12-30 01:21:11.305332	2025-12-30 01:36:29.432011	0	\N
8	2013332		{21,0,20,22,22,22,21}	t	1	2025-12-30 01:04:51.095703	2025-12-30 01:36:43.42637	0	\N
13	3201233		{22,21,0,20,21,22,22}	t	1	2025-12-30 01:26:10.273447	2025-12-30 01:36:53.710222	0	\N
12	3320113		{22,22,21,0,20,20,22}	t	1	2025-12-30 01:25:05.445912	2025-12-30 01:37:10.707735	0	\N
15	3322101		{22,22,21,21,20,0,20}	t	1	2025-12-30 01:38:39.768273	2025-12-30 01:38:39.768273	6	2026-01-02 19:44:10.521026
14	1333220		{20,22,22,22,21,21,0}	t	1	2025-12-30 01:36:03.598345	2025-12-30 01:36:03.598345	6	2026-01-02 19:44:10.521026
16	2011333		{21,0,20,20,22,22,22}	t	1	2025-12-30 01:40:21.761169	2025-12-30 01:40:21.761169	6	2026-01-02 19:44:10.521026
17	3232013		{22,21,22,21,0,20,22}	t	1	2025-12-30 01:41:20.6248	2025-12-30 01:41:20.6248	5	2026-01-02 19:44:10.521026
18	0123332		{0,20,21,22,22,22,21}	t	1	2025-12-30 01:42:15.828553	2025-12-30 01:42:15.828553	4	2026-01-02 19:44:10.521026
\.


--
-- Data for Name: pending_attendance; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pending_attendance (id, user_id, check_time, check_type, location_name, latitude, longitude, notes, photo, confidence_score, matched_embeddings, security_level, reason, reason_details, status, reviewed_by, reviewed_at, review_notes, created_at, updated_at) FROM stdin;
1	12	2025-01-03 23:30:00	check_in	\N	-6.20000000	106.80000000	\N	\N	55.00	\N	\N	low_confidence	Face recognition confidence below threshold	approved	1	2026-01-04 00:55:51.840844	Face verified by security team	2026-01-04 00:42:03.30274	2026-01-04 00:55:51.840844
\.


--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reports (id, user_id, block_id, shift_id, type, title, description, photo_url, status, reviewed_by, reviewed_at, location_lat, location_lng, created_at) FROM stdin;
\.


--
-- Data for Name: roster_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roster_assignments (id, user_id, pattern_id, assignment_month, assigned_by, assigned_at, notes) FROM stdin;
30	8	18	2025-12-01	1	2026-01-02 01:51:29.5675	\N
31	11	16	2025-12-01	1	2026-01-02 01:51:29.5675	\N
32	12	15	2025-12-01	1	2026-01-02 01:51:29.5675	\N
33	13	14	2025-12-01	1	2026-01-02 01:51:29.5675	\N
34	14	17	2025-12-01	1	2026-01-02 01:51:29.5675	\N
35	8	15	2026-01-01	1	2026-01-02 19:44:10.521026	\N
36	11	14	2026-01-01	1	2026-01-02 19:44:10.521026	\N
37	12	16	2026-01-01	1	2026-01-02 19:44:10.521026	\N
38	13	17	2026-01-01	1	2026-01-02 19:44:10.521026	\N
39	14	18	2026-01-01	1	2026-01-02 19:44:10.521026	\N
\.


--
-- Data for Name: shift_assignments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.shift_assignments (id, user_id, shift_id, assignment_date, is_replacement, replaced_user_id, notes, created_by, created_at, updated_at) FROM stdin;
1523	13	20	2025-12-01	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1524	13	22	2025-12-02	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1525	13	22	2025-12-03	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1526	13	22	2025-12-04	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1527	13	21	2025-12-05	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1528	13	21	2025-12-06	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1529	13	20	2025-12-08	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1530	13	22	2025-12-09	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1531	13	22	2025-12-10	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1532	13	22	2025-12-11	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1533	13	21	2025-12-12	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1534	13	21	2025-12-13	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1535	13	20	2025-12-15	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1536	13	22	2025-12-16	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1537	13	22	2025-12-17	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1538	13	22	2025-12-18	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1539	13	21	2025-12-19	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1540	13	21	2025-12-20	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1541	13	20	2025-12-22	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1542	13	22	2025-12-23	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1543	13	22	2025-12-24	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1544	13	22	2025-12-25	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1545	13	21	2025-12-26	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1546	13	21	2025-12-27	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1547	13	20	2025-12-29	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1548	13	22	2025-12-30	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1549	13	22	2025-12-31	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1550	14	22	2025-12-01	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1551	14	21	2025-12-02	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1552	14	22	2025-12-03	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1553	14	21	2025-12-04	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1554	14	20	2025-12-06	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1555	14	22	2025-12-07	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1556	14	22	2025-12-08	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1557	14	21	2025-12-09	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1558	14	22	2025-12-10	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1559	14	21	2025-12-11	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1560	14	20	2025-12-13	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1561	14	22	2025-12-14	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1562	14	22	2025-12-15	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1563	14	21	2025-12-16	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1564	14	22	2025-12-17	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1565	14	21	2025-12-18	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1566	14	20	2025-12-20	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1567	14	22	2025-12-21	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1568	14	22	2025-12-22	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1569	14	21	2025-12-23	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1570	14	22	2025-12-24	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1571	14	21	2025-12-25	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1572	14	20	2025-12-27	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1573	14	22	2025-12-28	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1574	14	22	2025-12-29	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1575	14	21	2025-12-30	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1576	14	22	2025-12-31	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1577	8	20	2025-12-02	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1578	8	21	2025-12-03	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1579	8	22	2025-12-04	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1580	8	22	2025-12-05	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1581	8	22	2025-12-06	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1582	8	21	2025-12-07	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1583	8	20	2025-12-09	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1584	8	21	2025-12-10	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1585	8	22	2025-12-11	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1586	8	22	2025-12-12	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1587	8	22	2025-12-13	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1588	8	21	2025-12-14	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1589	8	20	2025-12-16	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1590	8	21	2025-12-17	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1591	8	22	2025-12-18	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1592	8	22	2025-12-19	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1593	8	22	2025-12-20	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1594	8	21	2025-12-21	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1595	8	20	2025-12-23	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1596	8	21	2025-12-24	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1597	8	22	2025-12-25	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1598	8	22	2025-12-26	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1599	8	22	2025-12-27	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1600	8	21	2025-12-28	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1601	8	20	2025-12-30	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1602	8	21	2025-12-31	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1603	12	22	2025-12-01	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1604	12	22	2025-12-02	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1605	12	21	2025-12-03	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1606	12	21	2025-12-04	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1607	12	20	2025-12-05	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1608	12	20	2025-12-07	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1609	12	22	2025-12-08	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1610	12	22	2025-12-09	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1611	12	21	2025-12-10	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1612	12	21	2025-12-11	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1613	12	20	2025-12-12	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1614	12	20	2025-12-14	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1615	12	22	2025-12-15	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1616	12	22	2025-12-16	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1617	12	21	2025-12-17	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1618	12	21	2025-12-18	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1619	12	20	2025-12-19	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1620	12	20	2025-12-21	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1621	12	22	2025-12-22	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1622	12	22	2025-12-23	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1623	12	21	2025-12-24	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1624	12	21	2025-12-25	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1625	12	20	2025-12-26	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1626	12	20	2025-12-28	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1627	12	22	2025-12-29	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1628	12	22	2025-12-30	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1629	12	21	2025-12-31	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1630	11	21	2025-12-01	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1631	11	20	2025-12-03	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1632	11	20	2025-12-04	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1633	11	22	2025-12-05	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1634	11	22	2025-12-06	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1635	11	22	2025-12-07	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1636	11	21	2025-12-08	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1637	11	20	2025-12-10	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1638	11	20	2025-12-11	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1639	11	22	2025-12-12	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1640	11	22	2025-12-13	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1641	11	22	2025-12-14	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1642	11	21	2025-12-15	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1643	11	20	2025-12-17	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1644	11	20	2025-12-18	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1645	11	22	2025-12-19	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1646	11	22	2025-12-20	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1647	11	22	2025-12-21	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1648	11	21	2025-12-22	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1649	11	20	2025-12-24	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1650	11	20	2025-12-25	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1651	11	22	2025-12-26	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1652	11	22	2025-12-27	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1653	11	22	2025-12-28	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1654	11	21	2025-12-29	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1655	11	20	2025-12-31	f	\N	\N	1	2026-01-02 01:51:34.111013	2026-01-02 01:51:34.111013
1656	13	22	2026-01-01	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1657	13	21	2026-01-02	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1658	13	22	2026-01-03	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1659	13	21	2026-01-04	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1660	13	20	2026-01-06	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1661	13	22	2026-01-07	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1662	13	22	2026-01-08	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1663	13	21	2026-01-09	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1664	13	22	2026-01-10	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1665	13	21	2026-01-11	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1666	13	20	2026-01-13	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1667	13	22	2026-01-14	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1668	13	22	2026-01-15	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1669	13	21	2026-01-16	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1670	13	22	2026-01-17	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1671	13	21	2026-01-18	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1672	13	20	2026-01-20	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1673	13	22	2026-01-21	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1674	13	22	2026-01-22	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1675	13	21	2026-01-23	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1676	13	22	2026-01-24	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1677	13	21	2026-01-25	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1678	13	20	2026-01-27	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1679	13	22	2026-01-28	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1680	13	22	2026-01-29	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1681	13	21	2026-01-30	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1682	13	22	2026-01-31	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1683	14	20	2026-01-02	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1684	14	21	2026-01-03	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1685	14	22	2026-01-04	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1686	14	22	2026-01-05	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1687	14	22	2026-01-06	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1688	14	21	2026-01-07	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1689	14	20	2026-01-09	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1690	14	21	2026-01-10	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1691	14	22	2026-01-11	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1692	14	22	2026-01-12	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1693	14	22	2026-01-13	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1694	14	21	2026-01-14	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1695	14	20	2026-01-16	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1696	14	21	2026-01-17	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1697	14	22	2026-01-18	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1698	14	22	2026-01-19	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1699	14	22	2026-01-20	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1700	14	21	2026-01-21	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1701	14	20	2026-01-23	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1702	14	21	2026-01-24	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1703	14	22	2026-01-25	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1704	14	22	2026-01-26	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1705	14	22	2026-01-27	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1706	14	21	2026-01-28	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1707	14	20	2026-01-30	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1708	14	21	2026-01-31	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1709	8	22	2026-01-01	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1710	8	22	2026-01-02	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1711	8	21	2026-01-03	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1712	8	21	2026-01-04	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1713	8	20	2026-01-05	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1714	8	20	2026-01-07	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1715	8	22	2026-01-08	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1716	8	22	2026-01-09	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1717	8	21	2026-01-10	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1718	8	21	2026-01-11	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1719	8	20	2026-01-12	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1720	8	20	2026-01-14	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1721	8	22	2026-01-15	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1722	8	22	2026-01-16	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1723	8	21	2026-01-17	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1724	8	21	2026-01-18	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1725	8	20	2026-01-19	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1726	8	20	2026-01-21	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1727	8	22	2026-01-22	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1728	8	22	2026-01-23	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1729	8	21	2026-01-24	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1730	8	21	2026-01-25	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1731	8	20	2026-01-26	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1732	8	20	2026-01-28	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1733	8	22	2026-01-29	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1734	8	22	2026-01-30	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1735	8	21	2026-01-31	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1736	12	21	2026-01-01	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1737	12	20	2026-01-03	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1738	12	20	2026-01-04	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1739	12	22	2026-01-05	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1740	12	22	2026-01-06	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1741	12	22	2026-01-07	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1742	12	21	2026-01-08	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1743	12	20	2026-01-10	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1744	12	20	2026-01-11	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1745	12	22	2026-01-12	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1746	12	22	2026-01-13	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1747	12	22	2026-01-14	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1748	12	21	2026-01-15	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1749	12	20	2026-01-17	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1750	12	20	2026-01-18	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1751	12	22	2026-01-19	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1752	12	22	2026-01-20	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1753	12	22	2026-01-21	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1754	12	21	2026-01-22	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1755	12	20	2026-01-24	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1756	12	20	2026-01-25	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1757	12	22	2026-01-26	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1758	12	22	2026-01-27	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1759	12	22	2026-01-28	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1760	12	21	2026-01-29	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1761	12	20	2026-01-31	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1762	11	20	2026-01-01	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1763	11	22	2026-01-02	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1764	11	22	2026-01-03	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1765	11	22	2026-01-04	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1766	11	21	2026-01-05	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1767	11	21	2026-01-06	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1768	11	20	2026-01-08	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1769	11	22	2026-01-09	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1770	11	22	2026-01-10	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1771	11	22	2026-01-11	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1772	11	21	2026-01-12	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1773	11	21	2026-01-13	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1774	11	20	2026-01-15	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1775	11	22	2026-01-16	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1776	11	22	2026-01-17	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1777	11	22	2026-01-18	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1778	11	21	2026-01-19	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1779	11	21	2026-01-20	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1780	11	20	2026-01-22	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1781	11	22	2026-01-23	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1782	11	22	2026-01-24	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1783	11	22	2026-01-25	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1784	11	21	2026-01-26	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1785	11	21	2026-01-27	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1786	11	20	2026-01-29	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1787	11	22	2026-01-30	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
1788	11	22	2026-01-31	f	\N	\N	1	2026-01-02 19:44:17.843168	2026-01-02 19:44:17.843168
\.


--
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.shifts (id, name, start_time, end_time, created_at, description, is_active, updated_at, color, code) FROM stdin;
22	Malam	23:00:00	07:00:00	2025-12-30 00:57:43.62669		t	2026-01-02 16:28:04.745823	hsl(352, 70%, 50%)	3
21	Siang	15:00:00	00:00:00	2025-12-30 00:57:13.192768		t	2026-01-02 16:28:24.255684	hsl(79, 70%, 50%)	2
20	Pagi	07:00:00	16:00:00	2025-12-30 00:56:26.305273		t	2026-01-02 16:28:42.157383	hsl(43, 70%, 50%)	1
\.


--
-- Data for Name: user_embeddings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_embeddings (id, user_id, embedding, created_at, updated_at, quality_score, consistency_score, distinctiveness_score, is_active, image_url) FROM stdin;
16	13	[-0.014164753411744092, 0.013422066442446388, 0.0029067015173213123, -0.007545593306897868, -0.02967247594158306, -0.07196223541889656, -0.01878657149608324, -0.25846823049252415, -0.06277720365903687, -0.2336470812688879, -0.0016164261688725633, 0.01007354988567236, -0.018203788899803338, 0.03107524342412863, -0.004548772586572558, 0.026208344991541684, -0.009806674724864208, -0.012317878206222157, -0.010042098188596223, -0.00019303923204965113, 0.06383537989993829, -0.019421435517369558, 0.06389289093597056, 0.004803045554997134, -0.17405137262594694, 0.020854240017892076, -0.02071987623711661, 0.009522320500637001, 0.09794829790924048, -0.03854533952639446, 0.010872274538576445, 0.038047655605564945, 0.005286519820556182, -0.009589737084331511, -0.19561390586782207, -0.025258021500976315, 0.1708458941890727, -0.011768736846559002, 0.010157375443065737, -0.35388612477273795, -0.0042709120094941875, 0.003094136951906493, 0.00245399396103231, -0.004882900418289534, 0.008958607666855425, 0.0028762088497398365, -0.06604788958228945, 0.09449287482593868, 0.003933413721121545, -0.023626411280514962, 0.008902898740143063, -0.0019323431504014346, 0.021179325638039592, -0.0011677705645853965, 0.028232012243620305, 0.0024059512166800254, -0.04529084239572797, 0.002732668514103234, -0.03907608167586437, 0.01824188744660357, 0.00507861275005987, -0.09256610238194395, 0.018713401201082096, 0.05892757405145096, -0.005227697947899754, 0.07151599031044775, -0.00228908303030058, 0.034322491681673416, 0.003237716868755548, 0.005083419306235581, -0.024062814171241443, -0.024608558065892197, -0.03525138543815564, 0.010902003288757586, -0.00047090414559909166, 0.015382400960632958, 0.005507421635931334, -0.0014447162335794587, 0.1643120772318714, 0.002298088221794863, -0.006748946434816882, -0.00202115966585442, -0.008299793752406042, 0.0403104827878311, 0.023408740689059907, 0.001323428804829684, -0.00017613258281185847, -0.04605221355994858, 0.0292987119493774, -0.022834889476954598, -0.035452685240140315, -0.008899517107615643, -0.0001939076467612438, -0.00926002465327895, -0.059183162513112925, -0.13812194332334848, 0.05616122914330109, -0.13723665036785873, -0.001855989827427118, -0.011730991271041585, 0.003583212424688902, -0.009718229807146954, 0.0023894283887876916, 0.0012489432494218057, -0.00502272873469007, 0.003622347300763405, -0.04170506021902825, 0.0017767317091201057, 0.014192774116192575, 0.003943406813112511, 0.038578509513752364, 0.013886059766558927, 0.012382969277269748, -0.23280722195735779, 0.00950574947679774, -0.032702310652723075, -0.019330767532496438, -0.022648006549529122, 0.05467629851428515, 0.17256586085159994, 0.24609496094061192, -0.02543001816722904, -0.24610324598687022, -0.005041746808781546, 0.004039184965343919, -0.002275930426233252, -0.0037582731424467787, 0.000955881100247368, -0.004589141232322274, -0.1418337781575313, 0.006647696296379236, 0.012537128320884728, -0.00559452544903843, -0.013903672009116352, 0.045788474162489316, -0.005375315381249633, -0.034414707524784094, -0.022170433609916093, -0.002588096272974927, 0.01809384067351391, -0.00893813067583908, -0.007321193443664555, 0.0004828047900957781, -0.048825740828343955, -0.03751783732815981, 0.15887473250277273, -0.011809293153821874, -0.0005530866752220298, 0.012591853770882976, -0.0064762188425016255, -0.0016979009514922505, -0.24359964209830318, 0.32756620174027645, -0.005205204643354943, -0.0033362373005179345, -0.0010486350732244033, 0.0028775099074762186, 0.010023208171368566, -0.08005020635474143, -0.0018692653660837104, -0.04586732738827601, -0.00032868841269951426, -0.005137087705030683, 0.0025048879496651485, -0.006858115144051656, 0.008775453755304306, 0.0015057716507715182, 0.08211316797189766, -0.0071732817123585585, -0.0005220708953518607, -0.03947805543101564, -0.03928402739625049, -0.0012947921468662413, 0.07711019212486672, -0.014184335401697687, 0.00024715091132038956, -0.0031336306200303453, -0.021918013507895618, -0.006151629151663072, 0.0018679964389786132, -0.03737729701559645, 0.10551770839582438, -0.010389584912346603, 0.008085964866865502, 0.1078643285391913, -0.05502671424775702, -0.01564440251003489, 0.03347140061903326, 0.028042782383127053, -0.08465676658017209, -0.04094220266386472, 0.003157089007667015]	2026-01-04 01:54:56.680907	2026-01-04 01:54:56.680907	\N	\N	\N	t	\N
17	13	[-0.006587319182599208, 0.02228109603348981, 0.013739273134373287, -0.012202600283258858, -0.0373614894346788, 0.17605767184310553, -0.14264588770443073, 0.19552979297391948, -0.017291671585093583, -0.11790778590176561, -0.021174692325745436, 0.004454911909271244, -0.011005184944517056, 0.00547415081370291, -0.0013244452862722568, 0.08176535667260523, -0.02157767371916692, -0.010458440881025193, 0.0019205749384818476, -0.003355920597494135, 0.122474566875617, 0.06241005691389196, 0.09386392171069326, 0.0036740408138656376, -0.14547953706605327, 0.006169224752922076, -0.02695613580015766, -0.06224414739420461, 0.1730231697407011, -0.10499223494344244, -0.0018148287374193908, 0.013466526951363378, -0.04051654937514957, -0.007781524252601326, -0.21232064400917186, 0.05420498254426884, -0.07754593664840642, 0.0033383844928620786, -0.001701928349559409, -0.2318119876368779, 0.0034544459057832965, 0.003221975696639468, 0.007983869437727692, -0.00894765227681591, 0.008987187849275538, -0.02812364171604627, -0.051683665229532126, 0.07627264739496972, 0.00840132078920211, 0.04397147281655697, 0.10890481027306591, -0.004353023828179119, -0.07206881398452994, 0.002594215421137308, -0.16251984842725192, 0.010009308731257233, -0.127410389987476, 0.002399357603441372, -0.06266168908396384, 0.016082200276280642, 0.034153787419870366, -0.10033400554832994, 0.07751465166218552, 0.10432183173787986, 0.002385895802020494, -0.018516548831095922, -0.006949289323022035, -0.014792404262431356, 0.013145930348400978, 0.0022101459285462284, -0.026695909385835763, -0.10254627652204494, 0.09271777660821148, 0.010965291744208273, -0.001454426362050136, 0.019120081216801588, 0.006212904244951538, 0.0020884567664440634, 0.05519481447434892, -0.003750642557112922, -0.009667279603053653, -0.06610434887037729, 0.0009229988287853824, 0.30766598693093006, -0.1148977142518066, -0.00025812529250045257, 0.0008260806339264261, 0.03688285298735552, -0.09480747063662848, 0.07876612561682374, -0.0569811767567505, 0.0025858391063578712, -0.0010410445407589616, -0.013057737830683215, -0.209390733151485, -0.17728283034851006, 0.04028851691783185, -0.033852273615421494, -0.00828526589553856, -0.014042274260892735, 0.003829222196570217, -0.014893816903375061, 0.005012863042353762, -0.0010982083023651887, -0.004165437776749343, 0.006073625427172196, -0.1381024642994773, 0.0032363101472651853, 0.010860542174661644, 0.004352314160415952, -0.0358721333557107, -0.004646381109964181, 0.011635627894549142, 0.1300184506820834, 0.015402055437118667, -0.03739652951331584, 0.00393824583800939, -0.02395736109241285, 0.04633858919837608, -0.004262106260756594, 0.2783503976706795, -0.02592651404656894, 0.03935816669470452, -0.007349027385754237, 0.00528708257759639, -0.010526184350086952, 0.0061911667115837985, 0.00189999282712025, 0.009489303868747405, 0.0416241973297858, 0.01217525385999128, 0.020931935659325773, -0.004979717739391479, 0.044402622991034583, 0.06576495259094861, -0.01075740379308126, -0.17149133045348539, -0.023667416176355146, 0.008972327667085112, 0.020720219972625766, -0.004176193154915934, -0.0071902261852301134, 0.00488167043238768, -0.003645667374684891, -0.12666707540416686, 0.1326375829388542, -0.012896525901806127, -0.0008556335930836184, 0.012517943295864264, -0.00007604955630213288, -0.02183624796733152, -0.14971951324099833, -0.013120247267160982, -0.006614769448328195, -0.0135012187153765, -0.007612120876465784, 0.022331953693871785, 0.019433122931450577, -0.028604021599134184, 0.0017389059282919871, -0.02070288247252192, 0.009204768073908177, -0.01263682102809758, 0.0010206186587507385, 0.004754198921565609, 0.014618252538408004, 0.02970482805851026, -0.17862219134707824, -0.005106450245790881, 0.0007911101134403858, -0.06187562679681034, -0.012063194339955011, -0.004775179289721465, -0.03684826739411012, -0.02422354052030715, 0.004926750633493001, 0.006167145109726336, -0.05530163344254353, -0.007920881301472671, 0.00046500665860216555, 0.01291154068353551, 0.03862532762714355, 0.004621388604375613, 0.0010343121266494215, -0.06449120140154008, -0.17149049598850402, 0.025921956154137255, 0.09554159120398224, 0.061402488877667825, -0.16531064205161736, -0.06131284349681287, 0.0005723235933087399]	2026-01-04 01:54:56.684129	2026-01-04 01:54:56.684129	\N	\N	\N	t	\N
18	13	[-0.010037361770230938, 0.012535763130520539, -0.0045851297320919394, 0.0014130956437906424, -0.01339031400207192, -0.02387226402929673, 0.029095994673901046, -0.0659677096543122, 0.05279168925405954, 0.20631091555703227, -0.0073913499709630705, 0.0041255821060554865, -0.0020064804954917693, 0.020260008306362792, -0.003101063465518917, -0.08146680993798189, -0.00725096100731904, -0.004291364045676513, -0.004465251751427476, -0.012483416281911896, 0.1827342384154685, 0.03578460633980043, -0.08341298357071983, 0.003938603264370077, 0.004030737145188409, 0.025424380174606145, -0.011873548068171017, 0.06843888100482332, 0.20804289244549992, -0.0449485262911393, -0.002506085702949233, -0.01939074905720584, -0.033272792071622814, 0.004920973504279374, 0.015287989011127845, -0.13595727256766202, 0.006951725663354223, -0.018386291570839652, 0.0008640026898568396, -0.06955818174195239, -0.0013457272603567805, -0.0004110649512537262, 0.002896090772974087, -0.0011858132351061145, 0.001476931054993343, -0.01146508115768712, 0.13877611036493245, -0.09423022835546745, 0.0015085688981575074, -0.03093096093925306, 0.000046532128765069626, 0.0028314788715650516, -0.15579907791722364, 0.00348619143198992, 0.11124429991441422, 0.012228380110909402, -0.08667613674746635, 0.0027536440520756077, -0.049585316952755074, 0.0029254157929104775, 0.042957667800710274, -0.11123607447333193, -0.0796248624785229, 0.14185823678264267, 0.0012127339293706262, 0.1931897128042097, -0.003236914792691806, 0.020115440963935288, 0.0009388661828423279, -0.0021832173498648965, -0.015756271977362582, -0.44288778861114464, 0.14816010184341605, -0.001118779545726707, 0.20528057475334738, 0.0029638673085313986, 0.008956413828528641, -0.0024279563526918685, 0.08571820813751214, 0.05685800012807717, 0.0048458981936131615, 0.009144747744577129, -0.00768727725710132, -0.18428641789071376, -0.07720280535592336, 0.0035745094513414994, 0.005377899922896661, -0.057905168068251474, 0.07848845520812851, -0.019737687209702676, -0.0978344020609974, -0.0009419662064861792, -0.0044939625641181955, 0.012866438528015254, 0.13896551902724555, -0.11296574168178557, -0.05273220009253649, -0.06454688391663987, 0.0031795809444641254, -0.003772772197482623, 0.0018005414393483206, -0.0022177645283733656, -0.0036714552431326417, 0.0075064227927434755, -0.005373761125323106, 0.004384491182033143, -0.03117151411271587, 0.0025047578697718034, -0.013253615404176135, 0.005815383119879586, 0.0862331252196111, 0.002931727133247244, 0.00789212538525023, -0.1415215599424018, 0.010875660131328646, 0.04416992198253363, -0.018540118122420235, -0.03445294915183163, 0.061124470852344244, 0.10435228925831022, 0.018968636408187352, 0.010229712480594176, -0.1522158552445953, -0.0061870097028168735, 0.00007881823065696655, -0.005480340285116378, -0.0036919527219347065, 0.00021820745588438343, 0.0016155684336831737, -0.12918897135334256, 0.0037647220778772184, 0.009448927014491366, -0.0017357797114182132, -0.09247531857963452, -0.05691535097294206, -0.007486937195931435, -0.05627992447346511, -0.000871403677619587, -0.006218543354266695, -0.005597757245846521, -0.0022087577076411757, -0.004032419113779283, 0.00019472975935804656, -0.009362998536065606, -0.024370471321552144, -0.02594806659017779, 0.00237385139987092, -0.008650045019213994, -0.003902427901150094, -0.008882977179953039, 0.01466156467577016, -0.11130936583558408, 0.21532069416975638, -0.0028087182788782573, 0.003508233974962671, -0.0041019893766378246, -0.002975057847897836, -0.016974235166640005, -0.15352924360871106, -0.009204985689459566, -0.025257964004303843, -0.0017299365935117131, -0.0028727888490340005, -0.0014637723981713894, -0.003704965393941256, 0.000259042255107499, 0.0014059720737432918, -0.1598781218336413, 0.0003874359002551987, 0.005859613957809845, 0.08943835758206993, 0.11859682351241538, -0.0016498749817184055, 0.04708533793200426, 0.01022981213211091, -0.0038212147089788156, 0.009159932028024304, -0.06739367629266095, -0.0021505446908920197, 0.001407679071628672, -0.01593855043395489, 0.0407802616709533, -0.009411914392266291, 0.0017894976997045507, 0.10951280731369142, -0.1908982569105334, -0.03670162381118328, 0.05355763875136245, -0.0036858336997120126, 0.007859861576892745, -0.03765016841475785, -0.0061708857148801135]	2026-01-04 01:54:56.685374	2026-01-04 01:54:56.685374	\N	\N	\N	t	\N
19	13	[-0.014173787663173346, 0.004193211800530152, 0.0018795503530678126, -0.008721561883778576, -0.024764980499941518, -0.03377843190980266, -0.020846360771749263, -0.19813878337493468, 0.00916998251634267, -0.2401395975942627, 0.004026414259904741, 0.006570426582475583, -0.014576293162637463, 0.0278673854189138, -0.0049127781463311855, 0.12071973527804825, -0.0009745786420670675, -0.007991513968324315, -0.002488598863601137, -0.005397087293408327, 0.07540447820921094, -0.010307900349156341, -0.03135520513721192, 0.002665077967808237, -0.07675917999228285, 0.03707277309336541, -0.014355312672963206, -0.03758638257922794, 0.09820974371974651, -0.14849017188202032, 0.02026795917599514, 0.12008458074866506, 0.024844683083878882, -0.00908087729992772, -0.1500011942926772, -0.017952881303347643, 0.13699547602991477, -0.014957120267075755, 0.0151434136483281, -0.36282478853392286, -0.004630620940909351, 0.004448252618549318, -0.0022419674225586297, 0.0014123804513169436, 0.003955068898881161, 0.02901770846811034, 0.019148477804406337, 0.023760642260655968, -0.005202241111506429, -0.029655249045869872, -0.06324557056412267, -0.00164237265082789, 0.07539296706247728, -0.0016323750196553656, -0.011823430360961331, 0.008405548309650557, -0.005916684251952947, 0.0033794300714753687, -0.0498251604463128, 0.017394929688174222, 0.009193544045567156, -0.04679272951590736, 0.011125651840585898, -0.016711189923936578, 0.001127540338455548, 0.17623877083481032, -0.004105980405088348, 0.029441225535653575, -0.0005244549698026629, 0.0018923265850720402, -0.013792019922958275, -0.16782967325491688, 0.0834267416542104, 0.0018123008322093832, 0.060341777629788325, 0.023513480431420514, 0.006619143133809771, -0.002329586481012398, 0.11051063707571064, -0.1310114082630713, -0.005714735804275093, 0.021466986669332697, -0.01146023319241851, 0.019498707237745324, 0.011220890747323489, 0.00290219268936063, 0.002042011772309847, -0.0742646064616847, 0.10059381769228203, 0.10650037707111888, -0.005243890787321608, -0.007608364611104441, -0.004523796847295283, -0.003442296439161582, 0.13974190898069694, -0.04783218606595605, 0.03413290817397542, -0.12565903050572036, 0.0026089636886187035, -0.022173011119577046, 0.005458552719146799, -0.0035280470317468732, 0.004746444869997581, 0.00039740956439805524, -0.00511928634922004, 0.005531980517395009, 0.08511049087051531, 0.0028236512318140536, 0.027503344472139535, 0.0012509249768455958, 0.042066263842940814, 0.011520508387936465, 0.005198560524783825, -0.2322758825003908, 0.009251790820568451, -0.05548844347359808, -0.01861810078733081, -0.020579844197253394, 0.10402983911292381, 0.24354175612694046, 0.19666045411111746, -0.015797424665406776, -0.23915771540433328, -0.0037309766277324866, 0.0036765561914330687, 0.0014819359268123085, -0.002780180820411149, 0.0029880033522504774, -0.002795879891827207, -0.12194059483463258, 0.005581218609357906, 0.010398978106734876, -0.003652120150332944, -0.03304438582663581, 0.0026296201899751515, -0.006332027101463718, -0.06905153965684235, -0.013639249496938762, -0.012089591170242617, 0.0176687329303112, -0.004784803251916585, -0.00895255781616915, 0.0012692676073234228, -0.052451519843205334, -0.0025394390631828492, 0.17435109178209973, -0.03025480842734366, 0.0052288420118769725, 0.006184962423054537, -0.009099122840029577, 0.010758814132190176, -0.16474264447126602, 0.2884952353628031, -0.003274713327964178, 0.0019320004600947077, -0.0017302459603381547, -0.004675071569297463, 0.010746189123685211, -0.030627279705851995, 0.0006077856953614667, -0.04815928144712159, 0.0015807564672514324, -0.005066932517661882, 0.0014181853847789864, -0.000891252049252085, 0.00964129412589434, 0.0022791199746043816, 0.08661561242148735, -0.004597268883364679, 0.006120195458871826, -0.02900028342317615, 0.05317157746165216, 0.0014367283660206545, -0.011863385029733206, -0.013320545331960134, -0.0006022074807329979, 0.014331295727011152, -0.03092201535365123, -0.003585850264383128, 0.003995077118699734, -0.10501216088709743, 0.06834494896248684, -0.005143404809330183, 0.004400251322934504, -0.06299149087097641, -0.06631694567833187, -0.05478645351264583, 0.033914486958672045, -0.008299131669652668, -0.12359236615981721, -0.032325356388285584, 0.007522549757263113]	2026-01-04 01:54:56.686788	2026-01-04 01:54:56.686788	\N	\N	\N	t	\N
20	13	[-0.012899863015452954, 0.014482331925980642, 0.012100589849128889, -0.0078091423665339575, -0.03373208377499115, -0.05026063483973506, 0.0356066685396596, -0.24792281587127737, -0.06883631867071717, -0.19279140851380733, 0.002463361094428995, 0.011948783333282602, -0.013243845156757573, 0.041571037312431926, -0.004863226010671193, 0.041818184254617315, -0.01030931934200841, -0.008840957008299287, -0.006325427645351947, -0.005112508475588563, 0.042541188618896, -0.009025529316014972, -0.009680625361268323, 0.0037975091306283962, -0.07996559399144905, 0.035382428408253015, -0.021804046584045052, 0.06376300956354948, 0.0865161893655216, -0.041944080444285485, 0.012095115534859991, 0.09570204027995526, 0.07866614563850717, -0.008131323642652549, -0.15300347400925496, -0.03693721189171852, 0.13200173204661142, -0.010311582455937197, 0.011435789422337276, -0.31411183886300326, -0.006129852692387409, 0.0026631446942429957, 0.0010057490175429198, -0.001162241715904096, 0.005533508202312538, 0.009384845684001693, 0.04889199666786413, -0.022451753515754777, -0.0036124972386434146, -0.016605867604719285, 0.01802147423817731, -0.0021222481252380033, 0.06341742927265565, -0.002933416609527276, 0.014695521914685554, 0.006523577239656459, -0.04866432554398279, 0.001400167865813579, -0.04843966818004941, 0.023334099727072264, 0.015849026427576098, -0.08883118913924878, 0.0056850441689422345, 0.12196376565260039, 0.00023351088040907513, 0.12704478611093284, -0.004268319948358879, 0.016487954712416375, 0.0017033210569702098, 0.0003642456839090312, -0.020648770695560863, -0.1688803637465107, 0.1042259443400573, 0.006863147705783846, 0.04918626480854376, 0.023265677317969285, 0.00984420006954431, 0.0008342617924196122, 0.1241040120528305, -0.02161751384224702, -0.004007246939269301, 0.07798329990493193, -0.008567603579347566, 0.06601252618231329, 0.09682207864637786, 0.001213346064762194, 0.003158599937901512, -0.041430415049742354, 0.06041464030496886, -0.06360563839514168, 0.08125820271118393, -0.01069987878940627, -0.003148789152755692, -0.0018112499381228743, 0.12666640091262021, -0.20776031086580013, 0.06566466601368379, -0.02771184868446891, 0.004054540898106659, -0.01634998299385904, 0.003949737302783843, -0.0072393163562979035, 0.000057384479096549466, 0.0028248309131078306, -0.0029761093690373994, 0.005747572237281716, -0.006593401289279121, 0.0029930687536642475, 0.01884442628171926, 0.007538100945947758, 0.10344902757285282, 0.012833569609823722, 0.007396120349239614, -0.2019377415474894, 0.010986530573826786, -0.03293583275051849, -0.020781992668835556, -0.021723865295738415, 0.019686315839099883, 0.18460052306531044, 0.25033060517873007, -0.009981511480375096, -0.2577033125433554, -0.003515447835325164, 0.0030838603675726163, -0.0008546888985564291, -0.002365503535920742, 0.0026499709031725443, -0.007411136994913601, -0.15553448102256548, 0.004156370780353498, 0.011768389870093036, -0.0021240148442186256, -0.006895790563069461, 0.023508314796103977, -0.006623132366441954, -0.05200422721744385, 0.026187953446502252, -0.0005324710098179513, 0.018466467629159468, -0.004873733657955784, -0.009137002112508182, 0.00005284013410393271, -0.07262978935370207, 0.024523918370955126, 0.2203585874075478, -0.015432188781571364, 0.002529484300852265, 0.008384826861613239, -0.003784793084618027, 0.007422439991702384, -0.1732148732580284, 0.3081401387186888, -0.009139457078893486, -0.00026254470253141225, -0.0024607810979840453, -0.0007247628759788505, 0.01322480799140022, -0.010295434253298817, -0.0013294534717810719, -0.05415747860652235, -0.0006499226646010125, -0.00960125898024057, 0.0015735105183955816, -0.003070716378825507, 0.00874320166244687, 0.007058015319230312, 0.10184795735594665, -0.006849231883428307, 0.003059871592758108, 0.0064272444890823245, 0.04546051245477289, 0.00034130616042374974, 0.026440084827266605, -0.0038921543246432854, -0.00015924691034081853, -0.07189148894696808, -0.016087338843535772, -0.006282225452377195, 0.0042591031142040405, -0.06918423844399336, 0.08480064842465855, -0.008084959609435723, 0.004353637015167699, 0.04419190205590922, -0.10724183515414334, -0.02274833506178383, 0.0413187010406946, 0.10022981040776548, -0.07779780279387004, -0.044224412665385, 0.004611278566121218]	2026-01-04 01:54:56.688447	2026-01-04 01:54:56.688447	\N	\N	\N	t	\N
11	8	[-0.007330643944442272, -0.004102522507309914, -0.0006972125847823918, 0.004475084599107504, -0.005602861754596233, -0.0484042689204216, 0.03094390220940113, -0.04496130719780922, -0.10921045392751694, -0.08565206825733185, 0.005632033571600914, 0.002848641946911812, -0.004433618858456612, 0.000681236619129777, -0.0033383979462087154, -0.12163630872964859, -0.010559255257248878, -0.006846318952739239, 0.005273382645100355, 0.0002717272436711937, 0.1482548862695694, -0.010412580333650112, -0.09690024703741074, 0.006333190947771072, -0.12587124109268188, 0.004840129055082798, -0.006872824393212795, -0.06090732663869858, -0.005831686779856682, -0.0766122117638588, 0.017488697543740273, -0.05654815584421158, 0.06812965869903564, -0.004385776352137327, 0.06279974430799484, -0.06550247222185135, -0.18999451398849487, 0.023742565885186195, 0.0006316857179626822, -0.1235535517334938, -0.0021436167880892754, -0.00017956274677999318, -0.00483763637021184, -0.010668925009667873, 0.0075300694443285465, 0.0524398498237133, -0.012655194848775864, 0.15996739268302917, -0.0022834709379822016, 0.07722432911396027, -0.21873264014720917, -0.002052149036899209, -0.2418951541185379, -0.001468209084123373, -0.11447366327047348, 0.00447917589917779, 0.1706007719039917, 0.0012325027491897345, 0.018031777814030647, -0.006643014959990978, -0.015296312980353832, -0.048899680376052856, -0.017733536660671234, 0.0862545594573021, 0.005215090699493885, 0.03071300871670246, -0.002708716783672571, -0.03023575246334076, -0.009571929462254047, -0.007593720220029354, -0.0017140445997938514, -0.2726689279079437, 0.009334973990917206, 0.009068673476576805, -0.06807906925678253, 0.0014562599826604128, -0.00851752795279026, 0.0018021841533482075, -0.13000351190567017, 0.07895518094301224, 0.0038739193696528673, -0.0004067412228323519, 0.0009157882886938751, 0.19672834873199463, 0.09762797504663467, 0.003808976849541068, -0.002408866072073579, 0.043878402560949326, -0.06149332597851753, 0.14256583154201508, 0.041610993444919586, 0.008098703809082508, -0.005212888121604919, -0.013353080488741398, -0.10851477831602097, -0.08243605494499207, -0.03418160229921341, -0.10186773538589478, -0.007884366437792778, 0.00027280638460069895, 0.002274126512929797, 0.0014497075462713838, -0.0047724610194563866, 0.0006992922280915082, 0.0014051981270313263, 0.0015152666019275784, -0.019952964037656784, -0.0008060603286139667, 0.0144383255392313, 0.005254209507256746, 0.07720272988080978, -0.0011495212092995644, -0.001615823362953961, -0.3444591760635376, -0.010383648797869682, -0.06962034851312637, 0.015086539089679718, -0.014635492116212845, 0.059479985386133194, -0.022757017984986305, -0.2311706840991974, -0.004917356185615063, 0.018042542040348053, -0.0032349461689591408, 0.0014511032495647669, 0.006453195586800575, 0.005191646050661802, -0.0058754500932991505, 0.003492054995149374, -0.10887852311134338, 0.0022246697917580605, 0.00997620727866888, 0.0001228927867487073, 0.14416661858558655, -0.06413301080465317, 0.006473612505942583, -0.07574979960918427, -0.06703721731901169, -0.013157674111425877, -0.0017560402629896998, -0.004203337244689465, 0.0005181013839319348, -0.0018333925399929285, -0.2223789244890213, -0.037221428006887436, 0.24344539642333984, 0.004377524834126234, 0.00419883755967021, 0.0037126466631889343, 0.0165136456489563, -0.010076607577502728, -0.01707395352423191, 0.008325576782226562, -0.011423718184232712, 0.010265183635056019, 0.012195213697850704, 0.009643022902309895, 0.005640858318656683, 0.12247803807258606, 0.0041139991953969, 0.004917646758258343, 0.001476635574363172, -0.00038349980604834855, -0.004993543494492769, 0.0006679101497866213, 0.0009230366558767855, 0.00099411781411618, 0.08886482566595078, -0.0040641468949615955, 0.0032752701081335545, -0.12171721458435059, -0.03224153444170952, -0.0034324824810028076, 0.04152536019682884, -0.014175260439515114, -0.003349136095494032, 0.04443259537220001, 0.0099711949005723, -0.0026933324988931417, -0.002970584202557802, -0.05617177113890648, 0.09680623561143875, 0.001304612960666418, 0.000055934990086825565, -0.1283852905035019, -0.008131179958581924, 0.06899448484182358, -0.05306713283061981, 0.0262150838971138, -0.04843660816550255, 0.0006640283390879631, -0.002915959805250168]	2025-12-28 22:20:38.340343	2026-01-04 00:10:05.584296	63.05	54.11	76.46	t	\N
10	8	[-0.008656355552375317, -0.007025889120995998, 0.00016348803183063865, 0.0008490138570778072, -0.007675244938582182, 0.07798860967159271, -0.08156909793615341, 0.08049978315830231, -0.08825571089982986, -0.1467629075050354, -0.00003961002948926762, -0.0006688521825708449, -0.005930967163294554, -0.011403486132621765, -0.002773985033854842, -0.09607840329408646, -0.003001401899382472, -0.004461267497390509, 0.005565425846725702, 0.006078922655433416, 0.13910992443561554, 0.01186398696154356, -0.18349571526050568, 0.00615634024143219, 0.009905352257192135, 0.013019701465964317, -0.007000985089689493, -0.13174894452095032, 0.0345139279961586, -0.08920228481292725, 0.014686954207718372, -0.04389512166380882, 0.0964527353644371, -0.007044727448374033, -0.003359950613230467, 0.004902973771095276, -0.3114221394062042, 0.021747443825006485, -0.001494174124673009, -0.0379616916179657, -0.00265705119818449, 0.0009178550099022686, -0.0064902231097221375, -0.008203327655792236, 0.0007883168291300535, 0.02529897354543209, -0.03955242782831192, 0.07097579538822174, -0.005922171287238598, 0.06257530301809311, -0.31991496682167053, -0.0008087391033768654, -0.1431865245103836, -0.0009646047838032246, -0.15838579833507538, 0.00032535401987843215, 0.06819719076156616, 0.0006730104796588421, 0.011279628612101078, -0.0013393013505265117, -0.026850556954741478, -0.008892061188817024, 0.036153778433799744, 0.020937133580446243, 0.00619902741163969, 0.07262726873159409, -0.002765654120594263, -0.01706923544406891, -0.0064108707010746, -0.004823768977075815, 0.00015370712208095938, -0.2270570993423462, -0.023326629772782326, 0.0016963017405942082, -0.040183283388614655, 0.009700535796582699, -0.0067745959386229515, 0.0010482047218829393, -0.13231831789016724, 0.10712459683418274, 0.005996409337967634, -0.10252491384744644, 0.0005278989556245506, 0.10760888457298279, 0.0447206124663353, 0.002664866391569376, -0.004153379239141941, -0.06460759043693542, 0.007448709569871426, 0.11464384943246841, 0.09591680765151978, 0.007738814689218998, -0.013906033709645271, -0.02999599650502205, -0.09878594428300858, 0.015961090102791786, -0.07445123046636581, -0.06270083785057068, -0.0035473911557346582, 0.008413499221205711, 0.003441184526309371, 0.004099039360880852, -0.010022883303463459, -0.0007822000770829618, -0.0013882671482861042, 0.0028437236323952675, -0.13226617872714996, 0.00410849042236805, 0.018184101209044456, 0.005522153340280056, 0.09635227918624878, -0.004769510123878717, 0.003966496326029301, -0.3727153241634369, -0.008576977998018265, -0.11402860283851624, 0.02194112166762352, -0.019096234813332558, 0.1270352005958557, -0.00823006872087717, -0.14293800294399261, -0.0005048364982940257, 0.12136130779981613, -0.005554288625717163, -0.0012318165972828865, 0.00495568010956049, 0.00601955084130168, -0.005879665724933147, 0.005068323574960232, 0.03533801808953285, 0.004059914033859968, 0.006619622930884361, -0.001177067868411541, 0.11400577425956726, -0.02037006802856922, 0.00676440866664052, 0.02639620378613472, -0.04381120949983597, -0.015049630776047707, -0.0003086991491727531, -0.0023799992632120848, -0.0012741133105009794, 0.004099597223103046, -0.247446209192276, -0.02922874130308628, 0.14585527777671814, 0.0013727836776524782, -0.0014243681216612458, -0.0013411079999059439, 0.00938779953867197, -0.010910526849329472, -0.008653411641716957, -0.024439115077257156, -0.00545728811994195, 0.01237220037728548, 0.016516273841261864, 0.008584381081163883, 0.00836936105042696, 0.11034122854471207, 0.00783610250800848, 0.0017507033189758658, 0.002002364955842495, 0.0015615425072610378, -0.003011920489370823, 0.005005607381463051, 0.004851398058235645, -0.004775359760969877, 0.10960620641708374, -0.004310122225433588, 0.00006529388338094577, -0.0809767097234726, 0.057781852781772614, -0.0034310093615204096, 0.009290805086493492, 0.006453815847635269, -0.0040174322202801704, 0.04191901907324791, 0.008828057907521725, 0.0014405293622985482, -0.007915354333817959, 0.06697242707014084, 0.058013271540403366, 0.011449054814875126, -0.0015758563531562686, -0.09671557694673538, 0.12903240323066711, 0.04441496357321739, -0.05185624584555626, 0.057549044489860535, -0.11100120842456818, 0.003811454400420189, -0.000005377484285418177]	2025-12-28 22:20:38.338986	2026-01-04 00:10:05.584296	63.91	51.26	82.88	t	\N
9	8	[-0.001346109202131629, -0.0028646341525018215, -0.0017055979697033763, -0.0013628739397972822, -0.015313593670725822, -0.009491683915257454, -0.05648894980549812, -0.10350141674280167, -0.05154184624552727, -0.2683018743991852, 0.011098071001470089, 0.002802816918119788, -0.0006555603467859328, 0.013482585549354553, -0.004770591389387846, -0.10104347765445709, -0.005606906488537788, 0.005135306157171726, 0.005380774382501841, -0.004383220337331295, 0.11210007965564728, -0.01940898783504963, -0.18406511843204498, 0.009119955822825432, -0.020373208448290825, 0.0024329114239662886, -0.005040780175477266, -0.07235087454319, 0.08136124908924103, -0.08058777451515198, 0.002966793952509761, 0.0050222245045006275, 0.14188991487026215, 0.003301877062767744, 0.22469273209571838, 0.06757747381925583, -0.14387290179729462, -0.006195853464305401, 0.008711112663149834, -0.10947833210229874, 0.00028761246358044446, 0.002382637932896614, 0.0020261849276721478, -0.008641804568469524, -0.0045977989211678505, 0.0636589378118515, -0.024151112884283066, 0.10015997290611267, -0.012596117332577705, 0.018873058259487152, 0.0188814215362072, -0.0017107190797105432, -0.18421489000320435, -0.002655609743669629, -0.0038296105340123177, -0.0006441365112550557, 0.189295694231987, 0.0018161071930080652, -0.009351342916488647, -0.00041659173439256847, 0.010166026651859283, -0.007941177114844322, -0.018516484647989273, 0.09889143705368042, 0.009980825707316399, 0.1446731686592102, -0.002413664013147354, 0.032754525542259216, -0.003164758672937751, -0.0029005773831158876, -0.00859467126429081, -0.20797176659107208, -0.1292313188314438, 0.006575847510248423, 0.09086206555366516, 0.011612595058977604, -0.0003221340593881905, -0.0009501565946266055, 0.02158169262111187, 0.07512934505939484, 0.0026125747244805098, 0.013434246182441711, -0.005702018737792969, 0.10558251291513443, -0.08099327981472015, 0.00482873385772109, -0.007084890268743038, -0.03696998953819275, 0.14627324044704437, 0.05385703966021538, 0.08505392074584961, -0.0016427701339125633, -0.004472705069929361, -0.02098771743476391, 0.13463129103183746, -0.1531335562467575, -0.01433597318828106, -0.06916771829128265, 0.0008432903559878469, -0.0024621477350592613, 0.0016710611525923014, -0.0012314439518377185, -0.007573078386485577, 0.001954431179910898, 0.002348059555515647, 0.007426312658935785, -0.03380358964204788, 0.001842303085140884, 0.010229946114122868, -0.008821014314889908, -0.017927385866642, 0.005402938928455114, -0.0030771016608923674, -0.29865843057632446, -0.00443047983571887, 0.05819468945264816, 0.002484384458512068, -0.03801961615681648, 0.25481051206588745, 0.08563245087862015, -0.13391539454460144, -0.010241352021694183, -0.04525519162416458, -0.009227638132870197, -0.0008532240753993392, 0.007722316309809685, 0.006273946259170771, -0.013839543797075748, 0.002100576413795352, -0.017468413338065147, 0.003940971102565527, 0.012026762589812279, -0.00008028062438825145, -0.027107875794172287, -0.024639833718538284, 0.0018178491154685616, -0.1398037225008011, -0.04653121903538704, -0.019000990316271782, 0.0036002001725137234, -0.004664830397814512, -0.0029518106020987034, -0.0018537624273449183, 0.1280825287103653, 0.016128137707710266, 0.007057201117277145, -0.009403934702277184, -0.004323156550526619, -0.00006878599378978834, 0.005353935994207859, -0.00867655873298645, -0.02220558375120163, 0.19899331033229828, -0.005677290726453066, 0.013636705465614796, 0.006732555106282234, -0.009430120699107647, 0.01252126693725586, -0.036858368664979935, -0.0018225031672045588, -0.007436560932546854, -0.00712186936289072, 0.0011149593628942966, -0.003219213569536805, -0.003314515110105276, 0.0019172277534380555, -0.004611803684383631, 0.21253161132335663, 0.0031309013720601797, 0.005783182103186846, -0.11065969616174698, 0.10572713613510132, 0.0010810538660734892, 0.053939759731292725, 0.031511154025793076, -0.0025234760250896215, -0.005980013404041529, -0.0036440547555685043, -0.002802243921905756, 0.0011348255211487412, -0.15451684594154358, 0.10087428241968155, 0.0005263631464913487, -0.0017367819091305137, -0.02510428987443447, -0.09071487933397293, -0.10557720065116882, -0.05767234414815903, -0.08077574521303177, -0.1668543666601181, -0.012140686623752117, -0.014435009099543095]	2025-12-28 22:20:38.337879	2026-01-04 00:10:05.584296	51.32	43.67	62.79	t	\N
8	8	[-0.012880159541964531, 0.022543178871273994, 0.011343958787620068, -0.01359168253839016, -0.04099502041935921, 0.07486984133720398, -0.041875943541526794, 0.21409213542938232, -0.0744917020201683, -0.12843669950962067, -0.020950132980942726, 0.00228314520791173, -0.007433974649757147, 0.02208976447582245, -0.001029784558340907, 0.0197642482817173, -0.019234217703342438, -0.00812048465013504, -0.00493970699608326, -0.006043368484824896, -0.03926386311650276, 0.06757533550262451, 0.07560025900602341, 0.009207414463162422, -0.16357463598251343, 0.025468310341238976, -0.03581633046269417, -0.004620235413312912, 0.22698402404785156, -0.07038075476884842, -0.005966112017631531, 0.00684245303273201, -0.02058587595820427, -0.011096672154963017, -0.12216964364051819, 0.124681755900383, -0.19211475551128387, -0.007019093260169029, 0.003733772085979581, -0.3620106875896454, 0.00784381665289402, 0.0037467610090970993, 0.009146743454039097, -0.010806992650032043, 0.01576203480362892, -0.016831036657094955, -0.07952246814966202, 0.05424312502145767, 0.002239810535684228, -0.028623508289456367, -0.08595594763755798, -0.0061091468669474125, -0.1050105094909668, 0.0037466902285814285, -0.011065120808780193, 0.016353992745280266, -0.13070999085903168, 0.001830408233217895, -0.07508806884288788, 0.020038936287164688, 0.00000021098632885241386, -0.08288053423166275, 0.038767628371715546, 0.1673649251461029, -0.008764124475419521, -0.05297194793820381, -0.008018803782761097, 0.0012747724540531635, 0.00803061481565237, 0.009169010445475578, -0.029919547960162163, -0.07093563675880432, 0.252711683511734, 0.012498349882662296, 0.04887700080871582, 0.017666704952716827, 0.000018207296307082288, 0.0023436781484633684, 0.038785167038440704, 0.06065713241696358, -0.0074801379814744, -0.04619365558028221, -0.014502362348139286, 0.15293341875076294, -0.08972466737031937, -0.0016609537415206432, 0.006275890860706568, -0.027226679027080536, -0.032344259321689606, 0.07935706526041031, 0.02223104238510132, 0.006066967733204365, 0.0034902633633464575, -0.02820427156984806, -0.2483300268650055, -0.09534592926502228, -0.013930948451161385, -0.021639583632349968, -0.005291283596307039, -0.0091738011687994, 0.0024675733875483274, -0.01371285691857338, -0.002834974555298686, -0.005623979493975639, -0.0013663589488714933, 0.005427159834653139, -0.20838387310504913, 0.004428353160619736, 0.007424371782690287, 0.013276390731334686, -0.03944939747452736, 0.0005432698526419699, 0.018137266859412193, 0.0859735757112503, 0.0083121657371521, 0.05938521400094032, 0.007478731218725443, -0.04188329353928566, 0.06244496628642082, 0.16825740039348602, 0.16136325895786285, -0.02445974014699459, 0.04021282121539116, -0.007401877082884312, 0.0023822947405278683, -0.005248854402452707, 0.002352289156988263, -0.005274559371173382, 0.003947005141526461, -0.018885035067796707, 0.013807672075927258, 0.015209106728434563, -0.006747275125235319, 0.00405619153752923, 0.0520784929394722, -0.010703968815505505, -0.0697522908449173, -0.03214910253882408, 0.0020918489899486303, 0.008803063072264194, -0.00268838694319129, -0.004590463358908892, 0.0052299643866717815, -0.03412740305066109, -0.23004934191703796, 0.18559309840202332, -0.03526419401168823, -0.007922776974737644, 0.002102608559653163, -0.006968380883336067, -0.013961315155029297, -0.15575191378593445, 0.06979074329137802, -0.01721661351621151, -0.002963934326544404, 0.0007949169958010316, 0.01813635416328907, 0.007807808928191662, -0.07693459838628769, 0.006489396095275879, -0.042205967009067535, 0.0061732325702905655, -0.0111077344045043, 0.0015479468274861574, 0.012399367056787014, 0.013762994669377804, 0.020093079656362534, 0.00987178273499012, -0.004371536895632744, 0.00029176808311603963, -0.011292153969407082, 0.06378871947526932, -0.008473576977849007, -0.03751764073967934, -0.03665771707892418, 0.0022699469700455666, -0.07202663272619247, -0.059829045087099075, -0.009269224479794502, 0.0028030886314809322, 0.09177135676145554, 0.014999570325016975, 0.006061206571757793, -0.0023068233858793974, -0.08980798721313477, -0.0002737431204877794, -0.09601287543773651, 0.09478326141834259, 0.1442452222108841, -0.07333841174840927, -0.06505248695611954, -0.009676745161414146]	2025-12-28 22:20:38.336791	2026-01-04 00:10:05.584296	46.23	36.65	60.61	t	\N
7	8	[-0.013483745977282524, 0.010017150081694126, 0.013563184067606926, -0.0035711543168872595, -0.04261593893170357, -0.007265493739396334, 0.10753804445266724, 0.15166190266609192, -0.14673730731010437, 0.27645283937454224, 0.00458197807893157, 0.0009725677082315087, -0.004064357373863459, 0.0320935994386673, -0.0020754928700625896, -0.06431432068347931, -0.016033370047807693, 0.0018925921758636832, 0.0017185155302286148, -0.005055320914834738, -0.07267695665359497, 0.08132325112819672, 0.1436503827571869, 0.00244915415532887, -0.11069345474243164, 0.013536772690713406, -0.019153069704771042, 0.1727709025144577, 0.21611714363098145, -0.22458414733409882, -0.012240095995366573, 0.048156168311834335, 0.1388162523508072, 0.00435077678412199, -0.08852985501289368, 0.11516121029853821, -0.21721431612968445, -0.011853610165417194, 0.0029122044797986746, 0.03969274461269379, 0.00030708068516105413, 0.0022403374314308167, -0.00022194779012352228, -0.007647196762263775, 0.015131039544939995, 0.010390156880021095, -0.05031782016158104, 0.01633680798113346, -0.00935017503798008, -0.02779313549399376, -0.14003242552280426, -0.0028222391847521067, -0.18633565306663513, -0.0009290383313782513, 0.0653722807765007, 0.012626182287931442, 0.09069191664457321, 0.0007455031154677272, -0.0899147242307663, 0.008474667556583881, 0.07902952283620834, -0.1253100037574768, 0.0015707571292296052, -0.07520511001348495, 0.0002995260583702475, -0.14646199345588684, -0.004569633863866329, -0.04720285162329674, 0.003578874748200178, -0.0050478545017540455, -0.022487496957182884, 0.034510426223278046, 0.1534380316734314, 0.012811321765184402, 0.0004214086220599711, 0.0017608040943741798, -0.0031007167417556047, 0.00040250379242934287, -0.052033212035894394, -0.0064002652652561665, 0.0007954912725836039, 0.0053783911280334, -0.019576644524931908, 0.18710029125213623, 0.07707878947257996, -0.00042525952449068427, -0.0016641485271975398, 0.029522547498345375, -0.017222026363015175, -0.05174975469708443, 0.10732673853635788, -0.0019255903316661716, 0.005209437571465969, -0.01464423630386591, 0.027416467666625977, 0.03478074073791504, -0.0766473188996315, 0.0889202132821083, 0.0031257523223757744, 0.002380109392106533, 0.000751414627302438, -0.004336303565651178, -0.005394724663347006, -0.005125867202877998, -0.003611620282754302, 0.001561454962939024, -0.07087092101573944, 0.006619353778660297, 0.014844715595245361, 0.009782472625374794, -0.135549858212471, 0.0007393639534711838, 0.0020289134699851274, -0.09917924553155899, 0.002944284351542592, -0.08717387169599533, 0.009793093428015709, -0.05351727083325386, 0.08044250309467316, 0.013562656007707119, -0.13576364517211914, 0.007520722690969706, 0.05408396199345589, 0.001330291386693716, 0.0015133303822949529, 0.012099157087504864, -0.0015623332001268864, 0.0051372773014009, -0.0023041090462356806, -0.07603327184915543, 0.0036640705075114965, 0.004272707737982273, 0.00025201545213349164, 0.05170475319027901, 0.10236682742834091, -0.013103186152875423, -0.2521619498729706, -0.030014513060450554, 0.006234901491552591, 0.011087559163570404, -0.004058536607772112, 0.0034093137364834547, 0.005349619314074516, -0.036209650337696075, 0.0015089466469362378, -0.06387956440448761, -0.025098776444792747, -0.0024484999012202024, -0.0016062052454799414, -0.002938765799626708, 0.010715918615460396, -0.14188408851623535, 0.04106884449720383, -0.012195401825010777, 0.00040793372318148613, 0.006731044966727495, -0.008754716254770756, -0.0024467564653605223, 0.004169033374637365, 0.0008719489560462534, -0.03884272277355194, -0.0001444812078261748, -0.005089252721518278, -0.0020885304547846317, 0.010979517363011837, 0.01590733602643013, 0.02016640454530716, 0.20592977106571198, -0.0005364656681194901, 0.0014072207268327475, 0.13071967661380768, 0.03741263225674629, -0.0007454909500665963, -0.16835664212703705, -0.03451470658183098, 0.0030163004994392395, -0.1111813560128212, -0.060134317725896835, -0.008118504658341408, -0.0036212406121194363, -0.16424456238746643, -0.09570562839508057, 0.011237944476306438, -0.008103410713374615, -0.13513153791427612, 0.06553974002599716, -0.014334127306938171, 0.051093555986881256, -0.07764316350221634, -0.03780693560838699, -0.0381820909678936, -0.004882324021309614]	2025-12-28 22:20:38.336024	2026-01-04 00:10:05.584296	62.45	37.57	99.78	t	\N
6	8	[-0.0052607422694563866, 0.00021074950927868485, 0.003573040245100856, -0.009563453495502472, -0.017946487292647362, -0.004775182344019413, -0.003844460705295205, -0.17279961705207825, -0.09123535454273224, -0.03247150406241417, 0.004488085862249136, -0.0036468952894210815, -0.004578496795147657, 0.011808639392256737, -0.0019318839767947793, -0.0049803173169493675, -0.0013663192512467504, -0.006787887774407864, -0.0029359019827097654, -0.00029629163327626884, 0.1285935938358307, 0.021279361099004745, 0.02928304113447666, 0.00601682486012578, -0.054563507437705994, -0.002107654232531786, -0.013919267803430557, -0.11687705665826797, 0.12183625251054764, -0.09785141795873642, 0.00914431270211935, -0.12728695571422577, 0.03161972016096115, -0.0030540674924850464, -0.06282032281160355, -0.1541215479373932, -0.32795557379722595, 0.011212780140340328, 0.0026976389344781637, -0.26286783814430237, 0.0018301354721188545, 0.0025930472183972597, -0.0009904707549139857, -0.014478681609034538, 0.010772760026156902, 0.04205990955233574, -0.12592023611068726, 0.14732640981674194, -0.004298260901123285, 0.019908593967556953, -0.14598366618156433, 0.0005329138948582113, -0.06186353415250778, -0.0030801238026469946, -0.024379555135965347, 0.009152112528681755, 0.03379484638571739, 0.003163502551615238, -0.04553287848830223, 0.0004706043691840023, 0.0414029136300087, -0.11104489117860794, 0.05976911261677742, -0.0129536222666502, -0.00588099705055356, -0.07863812148571014, -0.0026512062177062035, 0.0012269855942577124, -0.013757634907960892, -0.004337709862738848, -0.007864018902182579, -0.13310563564300537, -0.06287875026464462, 0.020138699561357498, -0.03280811756849289, -0.00929669663310051, -0.009585811756551266, -0.0002231248508905992, -0.03978756442666054, -0.0926152691245079, 0.0022494220174849033, -0.07684744894504547, -0.0027496209368109703, 0.20013627409934998, 0.09363221377134323, 0.0027468556072562933, -0.008029280230402946, 0.062459785491228104, -0.06317360699176788, 0.21572816371917725, 0.07745766639709473, 0.0037687572184950113, -0.004789481405168772, -0.009890223853290081, 0.05560673028230667, -0.10328635573387146, -0.07303427159786224, 0.02419453114271164, -0.0071741254068911076, 0.005538248922675848, 0.004288067575544119, -0.0022977625485509634, 0.001874554785899818, 0.0032444598618894815, -0.01091335155069828, -0.00020003505051136017, -0.025759395211935043, 0.002168692648410797, 0.0033076193649321795, 0.005713517777621746, 0.10038481652736664, 0.0005911793559789658, -0.004282617475837469, -0.22515006363391876, -0.0074101658537983894, 0.005475337617099285, 0.008252816274762154, -0.0341743640601635, -0.039307184517383575, 0.046858616173267365, -0.3722551763057709, 0.014159275218844414, 0.20127080380916595, -0.004370450042188168, 0.003298718947917223, 0.005160926841199398, -0.00281944265589118, -0.0063631669618189335, 0.009139006957411766, 0.03964478522539139, 0.0027119675651192665, 0.003693243721500039, 0.0041411216370761395, -0.0000009391941944159043, -0.05061185732483864, 0.0028028569649904966, -0.05880871042609215, -0.06745833158493042, -0.012442477978765965, -0.0004923489759676158, -0.0011546253226697445, 0.0030713453888893127, -0.003491379553452134, -0.18145743012428284, -0.014053815975785255, 0.17279937863349915, -0.025159427896142006, -0.005626199766993523, -0.0009978333255276084, 0.008539394475519657, 0.0019876875448971987, -0.040282562375068665, 0.09865942597389221, -0.0012793670175597072, 0.009524659253656864, 0.014327231794595718, -0.008817718364298344, -0.008239328861236572, -0.11307580024003983, 0.00565923610702157, -0.004222632851451635, -0.003695428604260087, -0.0032253041863441467, -0.0026116548106074333, 0.0033534567337483168, 0.0037417493294924498, -0.00017493360792286694, 0.1689930558204651, 0.000034727352613117546, -0.0020290608517825603, 0.008122816681861877, 0.10670007020235062, -0.005492517724633217, -0.08869797736406326, 0.004632860887795687, 0.0024588857777416706, -0.021623333916068077, -0.0069408356212079525, -0.0014378312043845654, 0.0006252048769965768, -0.07698123902082443, 0.029651300981640816, 0.008102061226963997, -0.002213835483416915, 0.04888162761926651, 0.02453017421066761, -0.02770472876727581, -0.05590853840112686, 0.02168731763958931, -0.08560355007648468, -0.005589705891907215, -0.001679376931861043]	2025-12-28 22:20:38.33517	2026-01-04 00:10:05.584296	61.23	47.62	81.64	t	\N
5	8	[-0.0038986648432910442, -0.0031253083143383265, -0.007508111651986837, 0.008369533345103264, -0.0034361612051725388, 0.0060567911714315414, -0.014654207974672318, -0.08416154980659485, -0.1406928300857544, -0.03040078468620777, 0.012255242094397545, 0.004811062477529049, -0.006907558999955654, 0.0027204996440559626, -0.004673086106777191, -0.15757329761981964, -0.006881061475723982, -0.0044966633431613445, 0.003899185685440898, -0.0008239730377681553, 0.11401727795600891, -0.0391799621284008, -0.12834550440311432, 0.006781688425689936, -0.09145601838827133, 0.0016081526409834623, -0.003830359550192952, -0.10776078701019287, 0.03676768019795418, 0.05074493587017059, 0.015817027539014816, -0.03335712105035782, 0.06867178529500961, -0.0003378498659003526, 0.023692453280091286, -0.03600563853979111, -0.16116313636302948, 0.029009899124503136, -0.0015743576223030686, 0.0515359528362751, -0.005064903758466244, -0.00005333057197276503, 0.0009093979024328291, -0.010041735135018826, -0.0005536804092116654, 0.05911184102296829, 0.12032980471849442, 0.10527598857879639, -0.0031179545912891626, 0.0742466077208519, -0.10098038613796234, 0.0010064253583550453, -0.23227384686470032, -0.0022910272236913443, -0.17171907424926758, -0.0049184043891727924, 0.13646090030670166, 0.0022882092744112015, 0.020919743925333023, -0.012624229304492474, 0.00899815745651722, -0.016324469819664955, -0.04432529956102371, 0.1092500239610672, 0.011146743781864643, -0.03544362634420395, -0.0019907294772565365, -0.021240388974547386, -0.0034282980486750603, -0.010759477503597736, -0.004021957982331514, -0.39348068833351135, 0.01778394915163517, 0.0026734203565865755, -0.038061801344156265, -0.001505299936980009, -0.0009664640529081225, 0.0019023623317480087, -0.04858885705471039, 0.14433890581130981, 0.00431068055331707, -0.0056736585684120655, 0.003272696863859892, 0.17568665742874146, 0.003520488739013672, 0.004716450814157724, -0.006503615994006395, 0.09800601750612259, 0.01128130592405796, 0.11337340623140335, 0.02294197678565979, 0.006415637210011482, -0.004402116406708956, -0.00913767609745264, 0.026323508471250534, -0.07863212376832962, 0.021901000291109085, -0.17256395518779755, -0.0045000468380749226, -0.005000212695449591, 0.0006664149113930762, 0.003785765962675214, -0.00725210877135396, 0.002220726804807782, 0.0057670376263558865, 0.003006120678037405, -0.06339370459318161, -0.0008336826576851308, 0.004805069416761398, 0.0012642580550163984, 0.10327623039484024, -0.0012707037385553122, 0.0017799277557060122, -0.3028687536716461, -0.00584091292694211, -0.16729483008384705, 0.009776243939995766, -0.01748305931687355, 0.13035449385643005, -0.12364862859249115, -0.2546951174736023, -0.024578582495450974, -0.04001098498702049, -0.0015119971940293908, 0.0026619841810315847, 0.0033160364255309105, 0.007919478230178356, -0.002350924536585808, 0.0058972882106900215, -0.06026171147823334, 0.0025431036483496428, 0.01587439514696598, 0.0008557116962037981, 0.1018434464931488, -0.0727662518620491, 0.006235977169126272, -0.06616932153701782, -0.12796375155448914, -0.010841701179742813, -0.0036543970927596092, -0.005685614887624979, -0.001750526949763298, -0.0036949284840375185, -0.06517345458269119, 0.04825162887573242, 0.13370849192142487, 0.0016153673641383648, 0.0013255386147648096, 0.0015383220743387938, 0.011327698826789856, -0.008183352649211884, -0.08157157897949219, -0.01036229357123375, -0.00861244834959507, 0.012279381044209003, 0.0021307237911969423, 0.010795961134135723, -0.0018329266458749771, 0.1841539740562439, -0.001469232956878841, 0.00858051422983408, -0.001729072886519134, 0.0007436759187839925, -0.004909150302410126, -0.00459584966301918, -0.00006386764289345592, 0.00017164571909233928, 0.020140523090958595, -0.004427273292094469, 0.002335477853193879, -0.06435465067625046, -0.02750517427921295, -0.0021517646964639425, 0.05940549448132515, -0.0006523357587866485, -0.0035196940880268812, -0.04154789075255394, 0.011497278697788715, -0.003048747545108199, -0.004435192793607712, -0.03143810108304024, 0.08516893535852432, -0.004070536233484745, 0.001261012046597898, -0.19359776377677917, -0.0754743218421936, -0.003423608373850584, -0.06815807521343231, -0.012525048106908798, -0.10637922585010529, 0.002726409351453185, -0.0063608912751078606]	2025-12-28 22:20:38.328277	2026-01-04 00:10:05.584296	62.62	49.90	81.69	t	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, email, phone, password, role, shift_id, status, created_at, updated_at) FROM stdin;
1	Admin	admin@tia.com	081234567890	$2b$10$mEBUZFuzzZbhlde0uXl5/.vM.rcMGa5DY01SMy8oUXzSA7l1BgW/m	admin	\N	active	2025-12-21 00:13:43.513594	2025-12-21 00:13:43.513594
12	Rafi	\N	0851234567893	$2b$10$mEBUZFuzzZbhlde0uXl5/.vM.rcMGa5DY01SMy8oUXzSA7l1BgW/m	security	\N	active	2025-12-21 01:35:10.516042	2025-12-28 22:21:20.122748
13	Effendi	\N	0851234567894	$2b$10$mEBUZFuzzZbhlde0uXl5/.vM.rcMGa5DY01SMy8oUXzSA7l1BgW/m	security	\N	active	2025-12-21 01:35:10.516042	2025-12-27 18:54:17.945946
11	Supri	\N	0851234567892	$2b$10$mEBUZFuzzZbhlde0uXl5/.vM.rcMGa5DY01SMy8oUXzSA7l1BgW/m	security	\N	active	2025-12-21 01:35:10.516042	2025-12-27 18:54:17.945946
14	Hendy	\N	0851234567895	$2b$10$mEBUZFuzzZbhlde0uXl5/.vM.rcMGa5DY01SMy8oUXzSA7l1BgW/m	security	\N	active	2025-12-21 01:35:10.516042	2025-12-27 18:54:17.945946
8	Ilham	\N	0851234567891	$2b$10$mEBUZFuzzZbhlde0uXl5/.vM.rcMGa5DY01SMy8oUXzSA7l1BgW/m	security	\N	active	2025-12-21 01:35:10.516042	2025-12-27 18:54:17.945946
\.


--
-- Name: attendance_anomaly_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_anomaly_log_id_seq', 1, true);


--
-- Name: attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_id_seq', 63, true);


--
-- Name: attendance_verification_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attendance_verification_log_id_seq', 60, true);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 1, false);


--
-- Name: blocks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.blocks_id_seq', 20, true);


--
-- Name: embedding_quality_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.embedding_quality_history_id_seq', 7, true);


--
-- Name: face_login_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.face_login_logs_id_seq', 124, true);


--
-- Name: patterns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.patterns_id_seq', 18, true);


--
-- Name: pending_attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.pending_attendance_id_seq', 1, true);


--
-- Name: reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.reports_id_seq', 1, false);


--
-- Name: roster_assignments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.roster_assignments_id_seq', 39, true);


--
-- Name: shift_assignments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.shift_assignments_id_seq', 1788, true);


--
-- Name: shifts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.shifts_id_seq', 22, true);


--
-- Name: user_embeddings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_embeddings_id_seq', 20, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 32, true);


--
-- Name: attendance_anomaly_log attendance_anomaly_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_anomaly_log
    ADD CONSTRAINT attendance_anomaly_log_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance_verification_log attendance_verification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_verification_log
    ADD CONSTRAINT attendance_verification_log_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: blocks blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (id);


--
-- Name: embedding_quality_history embedding_quality_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.embedding_quality_history
    ADD CONSTRAINT embedding_quality_history_pkey PRIMARY KEY (id);


--
-- Name: face_login_logs face_login_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_login_logs
    ADD CONSTRAINT face_login_logs_pkey PRIMARY KEY (id);


--
-- Name: patterns patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patterns
    ADD CONSTRAINT patterns_pkey PRIMARY KEY (id);


--
-- Name: pending_attendance pending_attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_attendance
    ADD CONSTRAINT pending_attendance_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: roster_assignments roster_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_assignments
    ADD CONSTRAINT roster_assignments_pkey PRIMARY KEY (id);


--
-- Name: shift_assignments shift_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_pkey PRIMARY KEY (id);


--
-- Name: shift_assignments shift_assignments_user_id_assignment_date_shift_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_user_id_assignment_date_shift_id_key UNIQUE (user_id, assignment_date, shift_id);


--
-- Name: shifts shifts_code_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_code_unique UNIQUE (code);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: roster_assignments unique_assignment; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_assignments
    ADD CONSTRAINT unique_assignment UNIQUE (user_id, assignment_month);


--
-- Name: user_embeddings user_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_embeddings
    ADD CONSTRAINT user_embeddings_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_anomaly_log_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anomaly_log_created ON public.attendance_anomaly_log USING btree (created_at);


--
-- Name: idx_anomaly_log_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anomaly_log_severity ON public.attendance_anomaly_log USING btree (severity);


--
-- Name: idx_anomaly_log_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anomaly_log_status ON public.attendance_anomaly_log USING btree (status);


--
-- Name: idx_anomaly_log_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anomaly_log_type ON public.attendance_anomaly_log USING btree (anomaly_type);


--
-- Name: idx_anomaly_log_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_anomaly_log_user ON public.attendance_anomaly_log USING btree (user_id);


--
-- Name: idx_assignments_month; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignments_month ON public.roster_assignments USING btree (assignment_month);


--
-- Name: idx_assignments_pattern; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignments_pattern ON public.roster_assignments USING btree (pattern_id);


--
-- Name: idx_assignments_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignments_user ON public.roster_assignments USING btree (user_id);


--
-- Name: idx_assignments_user_month; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignments_user_month ON public.roster_assignments USING btree (user_id, assignment_month);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_date ON public.attendance USING btree (created_at);


--
-- Name: idx_attendance_face_verified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_face_verified ON public.attendance USING btree (user_id, face_verified);


--
-- Name: idx_attendance_shift_assignment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_shift_assignment ON public.attendance USING btree (shift_assignment_id);


--
-- Name: idx_attendance_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_user ON public.attendance USING btree (user_id);


--
-- Name: idx_attendance_verification_log_success; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_verification_log_success ON public.attendance_verification_log USING btree (success, created_at DESC);


--
-- Name: idx_attendance_verification_log_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_verification_log_user ON public.attendance_verification_log USING btree (user_id, created_at DESC);


--
-- Name: idx_embedding_quality_history_embedding; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_embedding_quality_history_embedding ON public.embedding_quality_history USING btree (embedding_id);


--
-- Name: idx_embedding_quality_history_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_embedding_quality_history_user ON public.embedding_quality_history USING btree (user_id, calculated_at DESC);


--
-- Name: idx_face_login_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_login_logs_created_at ON public.face_login_logs USING btree (created_at);


--
-- Name: idx_face_login_logs_success; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_login_logs_success ON public.face_login_logs USING btree (success);


--
-- Name: idx_face_login_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_face_login_logs_user_id ON public.face_login_logs USING btree (user_id);


--
-- Name: idx_patterns_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_patterns_active ON public.patterns USING btree (is_active);


--
-- Name: idx_patterns_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_patterns_created_by ON public.patterns USING btree (created_by);


--
-- Name: idx_pending_attendance_check_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pending_attendance_check_time ON public.pending_attendance USING btree (check_time);


--
-- Name: idx_pending_attendance_reason; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pending_attendance_reason ON public.pending_attendance USING btree (reason);


--
-- Name: idx_pending_attendance_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pending_attendance_status ON public.pending_attendance USING btree (status);


--
-- Name: idx_pending_attendance_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pending_attendance_user ON public.pending_attendance USING btree (user_id);


--
-- Name: idx_reports_block; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_block ON public.reports USING btree (block_id);


--
-- Name: idx_reports_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_date ON public.reports USING btree (created_at);


--
-- Name: idx_reports_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reports_user ON public.reports USING btree (user_id);


--
-- Name: idx_shift_assignments_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_shift_assignments_date ON public.shift_assignments USING btree (assignment_date);


--
-- Name: idx_shift_assignments_user_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_shift_assignments_user_date ON public.shift_assignments USING btree (user_id, assignment_date);


--
-- Name: idx_user_embeddings_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_embeddings_active ON public.user_embeddings USING btree (user_id, is_active);


--
-- Name: idx_user_embeddings_image_url; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_embeddings_image_url ON public.user_embeddings USING btree (user_id, image_url) WHERE (image_url IS NOT NULL);


--
-- Name: idx_user_embeddings_quality; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_embeddings_quality ON public.user_embeddings USING btree (user_id, quality_score DESC) WHERE (is_active = true);


--
-- Name: idx_user_embeddings_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_embeddings_user_id ON public.user_embeddings USING btree (user_id);


--
-- Name: idx_users_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_phone ON public.users USING btree (phone);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: attendance_anomaly_log trigger_anomaly_log_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_anomaly_log_updated_at BEFORE UPDATE ON public.attendance_anomaly_log FOR EACH ROW EXECUTE FUNCTION public.update_anomaly_log_updated_at();


--
-- Name: pending_attendance trigger_pending_attendance_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_pending_attendance_updated_at BEFORE UPDATE ON public.pending_attendance FOR EACH ROW EXECUTE FUNCTION public.update_pending_attendance_updated_at();


--
-- Name: attendance_anomaly_log attendance_anomaly_log_attendance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_anomaly_log
    ADD CONSTRAINT attendance_anomaly_log_attendance_id_fkey FOREIGN KEY (attendance_id) REFERENCES public.attendance(id) ON DELETE SET NULL;


--
-- Name: attendance_anomaly_log attendance_anomaly_log_pending_attendance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_anomaly_log
    ADD CONSTRAINT attendance_anomaly_log_pending_attendance_id_fkey FOREIGN KEY (pending_attendance_id) REFERENCES public.pending_attendance(id) ON DELETE SET NULL;


--
-- Name: attendance_anomaly_log attendance_anomaly_log_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_anomaly_log
    ADD CONSTRAINT attendance_anomaly_log_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id);


--
-- Name: attendance_anomaly_log attendance_anomaly_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_anomaly_log
    ADD CONSTRAINT attendance_anomaly_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_shift_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_shift_assignment_id_fkey FOREIGN KEY (shift_assignment_id) REFERENCES public.shift_assignments(id);


--
-- Name: attendance attendance_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: attendance attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: attendance_verification_log attendance_verification_log_attendance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_verification_log
    ADD CONSTRAINT attendance_verification_log_attendance_id_fkey FOREIGN KEY (attendance_id) REFERENCES public.attendance(id) ON DELETE SET NULL;


--
-- Name: attendance_verification_log attendance_verification_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_verification_log
    ADD CONSTRAINT attendance_verification_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: embedding_quality_history embedding_quality_history_embedding_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.embedding_quality_history
    ADD CONSTRAINT embedding_quality_history_embedding_id_fkey FOREIGN KEY (embedding_id) REFERENCES public.user_embeddings(id) ON DELETE CASCADE;


--
-- Name: embedding_quality_history embedding_quality_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.embedding_quality_history
    ADD CONSTRAINT embedding_quality_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: face_login_logs face_login_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_login_logs
    ADD CONSTRAINT face_login_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: patterns patterns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.patterns
    ADD CONSTRAINT patterns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pending_attendance pending_attendance_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_attendance
    ADD CONSTRAINT pending_attendance_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: pending_attendance pending_attendance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_attendance
    ADD CONSTRAINT pending_attendance_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: reports reports_block_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_block_id_fkey FOREIGN KEY (block_id) REFERENCES public.blocks(id);


--
-- Name: reports reports_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: reports reports_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: reports reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: roster_assignments roster_assignments_assigned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_assignments
    ADD CONSTRAINT roster_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: roster_assignments roster_assignments_pattern_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_assignments
    ADD CONSTRAINT roster_assignments_pattern_id_fkey FOREIGN KEY (pattern_id) REFERENCES public.patterns(id) ON DELETE CASCADE;


--
-- Name: roster_assignments roster_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roster_assignments
    ADD CONSTRAINT roster_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shift_assignments shift_assignments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: shift_assignments shift_assignments_replaced_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_replaced_user_id_fkey FOREIGN KEY (replaced_user_id) REFERENCES public.users(id);


--
-- Name: shift_assignments shift_assignments_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE;


--
-- Name: shift_assignments shift_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shift_assignments
    ADD CONSTRAINT shift_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_embeddings user_embeddings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_embeddings
    ADD CONSTRAINT user_embeddings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

