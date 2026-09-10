
import React, { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient";
import { StudentExamRunner } from "./StudentExamRunner";
import { AssignmentStudent } from "../assignment-hub/AssignmentStudent";
import { CenterSpinner } from "../../components/shared";

// Decides, invisibly, which experience the student sees:
// - Has structured sections (built via the new Reading Builder)?  → StudentExamRunner (new)
// - No sections (every assignment created before today, or any
//   non-structured assignment)?                                    → AssignmentStudent (old, untouched)
export function AssignmentOpenBridge({ userId, classId, assignmentId, setScreen, showToast }) {
  const [checking, setChecking] = useState(true);
  const [isStructured, setIsStructured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("exam_sections")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", assignmentId);
      if (!cancelled) {
        setIsStructured((count || 0) > 0);
        setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [assignmentId]);

  if (checking) return <CenterSpinner />;

  return isStructured ? (
    <StudentExamRunner userId={userId} classId={classId} assignmentId={assignmentId} setScreen={setScreen} showToast={showToast} />
  ) : (
    <AssignmentStudent userId={userId} classId={classId} assignmentId={assignmentId} setScreen={setScreen} showToast={showToast} />
  );
}
