const supabase = require("../config/supabase");

const getPosts = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("posts")
            .select("*")
            .order("published_at", { ascending: false });

        if (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch posts",
                error: error.message
            });
        }

        res.json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

module.exports = {
    getPosts
};