import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const ARTICLE_DB_ID = process.env.DATABASE_ID; // 文章数据库
const TAGS_DB_ID = process.env.TAGS_DB_ID;     // 全局标签数据库

// 修改为你实际的属性名称
const PROPS = {
    RELATION: "Tag",  // 你的 Relation 属性名 (连接到全局标签库的)
    SELECT: "tags"           // NotionNext 使用的 Multi-select/Select 属性名
};

/**
 * 1. 获取所有全局标签的 ID 和 Name 映射
 * 返回格式: { "page_id_1": "Linux", "page_id_2": "Life" }
 */
async function getTagMap() {
    console.log("📚 正在构建全局标签字典...");
    const tagMap = {};
    let hasMore = true;
    let cursor = undefined;

    while (hasMore) {
        const res = await notion.databases.query({
            database_id: TAGS_DB_ID,
            start_cursor: cursor,
        });

        for (const page of res.results) {
            // 假设标签库的标题属性叫 Name 或 Title
            const titleProp = page.properties['Name'] || page.properties['Title'] || page.properties['标签名'];
            if (titleProp && titleProp.title.length > 0) {
                const tagName = titleProp.title[0].plain_text;
                tagMap[page.id] = tagName;
            }
        }
        hasMore = res.has_more;
        cursor = res.next_cursor;
    }
    console.log(`✅ 字典构建完成，共 ${Object.keys(tagMap).length} 个标签`);
    return tagMap;
}

/**
 * 2. 同步文章的标签
 */
async function syncArticles(tagMap) {
    console.log("🚀 开始检查文章标签同步...");
    
    // 只检查最近更新的文章，或者全量检查（这里为了演示简单写全量，可自行加 filter）
    const pages = await notion.databases.query({
        database_id: ARTICLE_DB_ID,
        // filter: { ... } // 如果文章多，建议加 filter 只处理最近更新的
    });

    for (const page of pages.results) {
        const pageTitle = page.properties['Title']?.title[0]?.plain_text || "无标题";
        
        // 1. 获取 Relation 里的 ID 列表
        const relationIds = page.properties[PROPS.RELATION]?.relation.map(r => r.id) || [];
        
        // 2. 将 ID 转换为 标签名
        const targetTags = relationIds.map(id => tagMap[id]).filter(name => name); // 过滤掉未知的

        // 3. 获取当前 Multi-select 里的标签
        const currentTags = page.properties[PROPS.SELECT]?.multi_select.map(opt => opt.name) || [];

        // 4. 比较是否需要更新
        // 简单的数组比较：排序后转字符串对比
        const targetSorted = [...targetTags].sort().join(",");
        const currentSorted = [...currentTags].sort().join(",");

        if (targetSorted !== currentSorted) {
            console.log(`🔄 更新: [${pageTitle}]`);
            console.log(`   原: ${currentSorted || "(空)"} -> 新: ${targetSorted}`);
            
            // 构造 update payload
            // multi_select 格式: [ { name: "TagA" }, { name: "TagB" } ]
            const newOptions = targetTags.map(name => ({ name: name }));

            await notion.pages.update({
                page_id: page.id,
                properties: {
                    [PROPS.SELECT]: {
                        multi_select: newOptions
                    }
                }
            });
        }
    }
    console.log("🎉 标签同步完成！");
}

async function main() {
    if (!TAGS_DB_ID) {
        console.error("❌ 缺少环境变量 TAGS_DB_ID");
        return;
    }
    const tagMap = await getTagMap();
    await syncArticles(tagMap);
}

main().catch(console.error);
