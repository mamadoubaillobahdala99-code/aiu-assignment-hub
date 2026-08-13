import React, { useState, useEffect, useCallback } from "react";
import { Users, BookOpen, GraduationCap } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { fmtDate } from "../../lib/utils";
import { PageHeader, EmptyState, CenterSpinner } from "../../components/shared";

export function StudentClasses({ userId }) {
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("roster")
      .select("joined_at, classes(name, profiles(name))")
      .eq("student_id", userId);
    setClasses(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <CenterSpinner />;

  return (
    <div className="page">
      <PageHeader eyebrow="Student" title="My Classes" />

      {classes.length === 0 ? (
        <EmptyState icon={<Users size={26} />} title="You haven't joined a class yet" body="Get a join code from your teacher, then join from the sidebar." />
      ) : (
        <div className="grid">
          {classes.map((row, i) => (
            <div key={i} className="class-card" style={{ cursor: "default" }}>
              <div className="class-card-top">
                <div className="class-card-name">{row.classes?.name || "Class"}</div>
                <BookOpen size={16} className="chev" />
              </div>
              <div className="class-card-teacher">
                <GraduationCap size={13} /> {row.classes?.profiles?.name || "Unknown teacher"}
              </div>
              <div className="class-card-code">Joined {fmtDate(row.joined_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
