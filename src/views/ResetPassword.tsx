import { useEffect } from "react";
import { useNavigate } from "@/lib/router";

const ResetPassword = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/auth", { replace: true });
  }, [navigate]);

  return null;
};

export default ResetPassword;

